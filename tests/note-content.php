<?php

declare(strict_types=1);
require __DIR__ . '/../api/NoteContent.php';

$checks = 0;
function check(bool $condition, string $message): void {
  global $checks;
  if (!$condition) throw new RuntimeException($message);
  $checks++;
}

$png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
check(safeNoteImageSource($png), 'A valid embedded PNG must be accepted.');
check(safeNoteImageSource('https://example.com/photo.png'), 'HTTPS image URLs must be accepted.');
foreach (['javascript:alert(1)', 'http://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,bm90IGFuIGltYWdl', 'https://user:password@example.com/image.png'] as $unsafe) {
  check(!safeNoteImageSource($unsafe), 'Unsafe or invalid image source must be rejected.');
}
check(!safeNoteImageSource('data:image/png;base64,' . str_repeat('A', 2 * 1024 * 1024)), 'Oversized embedded images must be rejected.');

$html = '<h2>A café ☕</h2><p><span style="font-family: Palatino, &quot;Book Antiqua&quot;, serif; font-size: 24px; color: rgb(36, 107, 79)"><strong><em><u><s>Rich text</s></u></em></strong></span></p><img src="' . $png . '" alt="A tiny picture">';
$safe = sanitizeHtml($html);
check(str_contains($safe, 'A café ☕'), 'Unicode must survive sanitization.');
check(str_contains(html_entity_decode($safe), 'font-family: Palatino, "Book Antiqua", serif'), 'Quoted font families must survive saving.');
check(str_contains($safe, 'font-size: 24px') && str_contains($safe, 'color: rgb(36, 107, 79)'), 'Font size and custom color must survive saving.');
check(str_contains($safe, '<strong><em><u><s>Rich text</s></u></em></strong>'), 'Inline formatting must survive saving.');
check(str_contains($safe, 'src="' . $png . '"') && str_contains($safe, 'alt="A tiny picture"'), 'Embedded images and alt text must survive saving.');
check(str_contains(sanitizeHtml($safe), $png), 'Images must survive a second save.');
foreach ([64, 400, 1600] as $width) {
  $sized = sanitizeHtml('<img src="' . $png . '" width="' . $width . '" height="100" style="width: 10px; height: 100px">');
  check(str_contains($sized, 'width="' . $width . '"'), 'Image width must survive saving.');
  check(str_contains(sanitizeHtml($sized), 'width="' . $width . '"'), 'Image width must survive repeated saves.');
  check(!str_contains($sized, 'height=') && !str_contains($sized, 'style='), 'Images must not persist a fixed height that distorts their proportions.');
}
foreach (['0', '63', '1601', '-400', '100%', '400px', '400; color:red'] as $width) {
  check(!str_contains(sanitizeHtml('<img src="' . $png . '" width="' . $width . '">'), 'width='), 'Invalid image widths must be removed.');
}

$malicious = '<unknown><img src="' . $png . '" onerror="alert(1)"><span style="background-color: red; color: #123456; font-family: url(evil); font-size: 999px">Safe</span><script>alert(2)</script></unknown><a href="javascript:alert(3)" onclick="alert(4)">Link</a><svg onload="alert(5)"></svg>';
$clean = sanitizeHtml($malicious);
foreach (['onerror', 'onclick', 'onload', 'javascript:', '<script', '<svg', 'background-color', 'url(', '999px', 'alert('] as $bad) {
  check(!str_contains($clean, $bad), 'Unsafe markup must be removed, including inside unknown wrappers: ' . $bad);
}
check(str_contains($clean, 'color: #123456'), 'A safe style alongside unsafe styles must be retained.');
$tasks = sanitizeHtml('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Done</p></div></li></ul>');
check(str_contains($tasks, 'data-checked="true"') && str_contains($tasks, 'checked'), 'Checklist states must survive saving.');
foreach (['#fff0a3', '#a1b2c3', 'rgb(204, 230, 255)'] as $color) {
  $highlight = sanitizeHtml('<p><mark data-color="' . $color . '" style="background-color: ' . $color . '; color: inherit"><strong>Remember this</strong></mark></p>');
  check(str_contains($highlight, '<mark data-color="' . $color . '"') && str_contains($highlight, 'background-color: ' . $color), 'Highlight colors must survive saving.');
  check(str_contains($highlight, '<strong>Remember this</strong>'), 'Highlighting must preserve other text formatting.');
  $savedAgain = sanitizeHtml($highlight);
  check(str_contains($savedAgain, 'data-color="' . $color . '"') && str_contains($savedAgain, 'background-color: ' . $color) && str_contains($savedAgain, '<strong>Remember this</strong>'), 'Highlights must survive repeated saves.');
}
check(str_contains(sanitizeHtml('<p><mark>Default highlight</mark></p>'), '<mark>Default highlight</mark>'), 'Default highlights must survive saving.');
$unsafeHighlight = sanitizeHtml('<mark data-color="url(https://example.com/track)" onclick="alert(1)" style="background-color: url(https://example.com/track); background-image: url(https://example.com/track); position: fixed; color: expression(alert(1))">Keep this text</mark>');
check(!str_contains($unsafeHighlight, 'data-color') && !str_contains($unsafeHighlight, 'style=') && !str_contains($unsafeHighlight, 'onclick'), 'Unsafe highlight attributes and CSS must be stripped.');
check(str_contains($unsafeHighlight, 'Keep this text'), 'Removing unsafe highlight styles must retain the text.');
$table = sanitizeHtml('<table><tbody><tr><th colwidth="160" style="height: 80px"><p>Header</p></th><td colspan="2" colwidth="160,0"><p>Cell</p></td></tr></tbody></table>');
check(str_contains($table, 'colwidth="160,0"') && str_contains($table, 'height: 80px'), 'Table dimensions and partially resized merged cells must survive saving.');
$link = sanitizeHtml('<a href="https://example.com" target="_blank">Link</a>');
check(str_contains($link, 'href="https://example.com"') && str_contains($link, 'noopener'), 'Safe links must be retained.');
echo "Passed $checks content persistence and sanitization checks.\n";
