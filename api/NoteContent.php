<?php

declare(strict_types=1);

/** Only embedded raster images and secure remote image URLs are persisted. */
function safeNoteImageSource(string $source): bool {
  if (strlen($source) > 2 * 1024 * 1024) return false;
  if (preg_match('#^data:image/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$#D', $source, $matches)) {
    $bytes = base64_decode($matches[2], true);
    if ($bytes === false) return false;
    $image = @getimagesizefromstring($bytes);
    return $image !== false && ($image['mime'] ?? '') === 'image/' . $matches[1];
  }
  $parts = parse_url($source);
  return filter_var($source, FILTER_VALIDATE_URL) !== false && is_array($parts)
    && strtolower($parts['scheme'] ?? '') === 'https' && !empty($parts['host'])
    && !isset($parts['user']) && !isset($parts['pass']);
}

function safeNoteStyle(string $style, string $tag): string {
  $safe = [];
  foreach (explode(';', $style) as $declaration) {
    $parts = explode(':', $declaration, 2);
    if (count($parts) !== 2) continue;
    [$property, $value] = array_map('trim', $parts);
    $property = strtolower($property);
    if ($tag === 'span') {
      if ($property === 'color' && preg_match('/^(?:#[0-9a-f]{3,8}|rgba?\(\s*[0-9.% ,\/]+\s*\)|[a-z]+)$/iD', $value)) {
        $safe[] = "color: $value";
      } elseif ($property === 'font-size' && preg_match('/^(\d{1,2})px$/D', $value, $matches) && (int)$matches[1] >= 8 && (int)$matches[1] <= 96) {
        $safe[] = "font-size: $value";
      } elseif ($property === 'font-family' && strlen($value) <= 200 && preg_match('/^[a-zA-Z0-9 ,\.\-\'"\s]+$/D', $value)) {
        $safe[] = "font-family: $value";
      }
    } elseif (in_array($tag, ['td', 'th'], true) && $property === 'height' && preg_match('/^(\d{1,3})px$/D', $value, $matches) && (int)$matches[1] >= 32 && (int)$matches[1] <= 400) {
      $safe[] = 'height: ' . (int)$matches[1] . 'px';
    } elseif ($tag === 'col' && in_array($property, ['width', 'min-width'], true) && preg_match('/^(\d{1,4})px$/D', $value, $matches) && (int)$matches[1] >= 1 && (int)$matches[1] <= 5000) {
      $safe[] = $property . ': ' . (int)$matches[1] . 'px';
    }
  }
  return implode('; ', $safe);
}

function sanitizeHtml(string $html): string {
  if (!class_exists('DOMDocument')) throw new RuntimeException('The PHP DOM extension is required to save formatted notes.');
  if ($html === '') return '';
  $doc = new DOMDocument();
  $previousErrors = libxml_use_internal_errors(true);
  $loaded = $doc->loadHTML('<?xml encoding="UTF-8"><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
  libxml_clear_errors();
  libxml_use_internal_errors($previousErrors);
  if (!$loaded) return '';
  $allowed = ['p', 'br', 'strong', 'em', 'u', 's', 'span', 'ul', 'ol', 'li', 'pre', 'code', 'div', 'blockquote', 'label', 'input', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'a'];
  $blocked = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'];
  $walker = function (DOMNode $node) use (&$walker, $allowed, $blocked): void {
    foreach (iterator_to_array($node->childNodes) as $child) {
      if (!($child instanceof DOMElement)) {
        if ($child instanceof DOMComment || $child instanceof DOMProcessingInstruction) $node->removeChild($child);
        continue;
      }
      $tag = strtolower($child->tagName);
      if (in_array($tag, $blocked, true)
        || ($tag === 'input' && strtolower($child->getAttribute('type')) !== 'checkbox')
        || ($tag === 'img' && !safeNoteImageSource($child->getAttribute('src')))) {
        $node->removeChild($child);
        continue;
      }
      // Sanitize descendants before unwrapping an unsupported element.
      $walker($child);
      if (!in_array($tag, $allowed, true)) {
        while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
        $node->removeChild($child);
        continue;
      }
      foreach (iterator_to_array($child->attributes) as $attribute) {
        $name = strtolower($attribute->name);
        $value = strtolower(trim($attribute->value));
        $task = ($tag === 'ul' && $name === 'data-type' && $value === 'tasklist')
          || ($tag === 'li' && $name === 'data-type' && $value === 'taskitem')
          || ($tag === 'li' && $name === 'data-checked' && in_array($value, ['true', 'false'], true))
          || ($tag === 'input' && $name === 'type' && $value === 'checkbox')
          || ($tag === 'input' && $name === 'checked');
        $table = (in_array($tag, ['td', 'th'], true) && in_array($name, ['colspan', 'rowspan'], true)
            && ctype_digit($value) && (int)$value >= 1 && (int)$value <= 100)
          || (in_array($tag, ['td', 'th'], true) && $name === 'colwidth'
            && preg_match('/^\d+(?:,\d+)*$/D', $value)
            && count(array_filter(explode(',', $value), fn($width) => (int)$width < 0 || (int)$width > 600)) === 0)
          || ($tag === 'col' && $name === 'width' && ctype_digit($value) && (int)$value >= 1 && (int)$value <= 5000);
        $style = in_array($tag, ['span', 'td', 'th', 'col'], true) && $name === 'style';
        $image = $tag === 'img' && in_array($name, ['src', 'alt'], true);
        $link = $tag === 'a' && $name === 'href' && preg_match('#^(?:https?://|mailto:)[^\s]+$#iD', trim($attribute->value));
        if (!($task || $table || $style || $image || $link)) $child->removeAttributeNode($attribute);
      }
      if ($child->hasAttribute('style')) {
        $safe = safeNoteStyle($child->getAttribute('style'), $tag);
        $safe ? $child->setAttribute('style', $safe) : $child->removeAttribute('style');
      }
      if ($tag === 'img') $child->setAttribute('loading', 'lazy');
      if ($tag === 'a') $child->setAttribute('rel', 'noopener noreferrer');
    }
  };
  $walker($doc);
  return $doc->saveHTML($doc->documentElement) ?: '';
}
