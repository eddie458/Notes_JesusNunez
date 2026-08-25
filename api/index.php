<?php

declare(strict_types=1);

// API responses must always be JSON. Send PHP diagnostics to the server log
// instead of mixing HTML warnings into the response body.
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require __DIR__ . '/Database.php';

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $config['cors_origin']);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

ini_set('session.use_strict_mode', '1');
if ((string)ini_get('session.save_path') === '') {
  session_save_path(sys_get_temp_dir());
}
session_name($config['session_name']);
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_start();

function reply(mixed $data, int $status = 200): never {
  http_response_code($status);
  if ($status !== 204) echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
  exit;
}

function fail(string $message, int $status = 400, string $code = 'REQUEST_FAILED'): never {
  reply(['error' => $message, 'code' => $code], $status);
}

function input(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || trim($raw) === '') return [];
  try {
    $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
  } catch (JsonException) {
    fail('The request body contains invalid JSON.', 400, 'INVALID_JSON');
  }
  return is_array($data) ? $data : [];
}

function csrfToken(): string {
  if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  return $_SESSION['csrf_token'];
}

function requireCsrf(): void {
  $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
  $stored = (string)($_SESSION['csrf_token'] ?? '');
  if ($sent === '' || $stored === '' || !hash_equals($stored, $sent)) {
    fail('Your security token expired. Refresh the page and try again.', 403, 'CSRF_FAILED');
  }
}

function publicUser(array $user): array {
  return [
    'id' => (int)$user['id'],
    'email' => $user['email'],
    'display_name' => $user['display_name'],
    'is_admin' => (bool)$user['is_admin'],
    'last_login_at' => $user['last_login_at'] ?? null,
    'created_at' => $user['created_at'] ?? null,
  ];
}

function currentUser(PDO $db): ?array {
  $id = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
  if (!$id) return null;
  $statement = $db->prepare('SELECT id, email, display_name, is_admin, last_login_at, created_at FROM users WHERE id = ? LIMIT 1');
  $statement->execute([$id]);
  return $statement->fetch() ?: null;
}

function requireUser(PDO $db): array {
  $user = currentUser($db);
  if (!$user) fail('Please sign in to continue.', 401, 'UNAUTHENTICATED');
  return $user;
}

function requireAdmin(PDO $db): array {
  $user = requireUser($db);
  if (empty($user['is_admin'])) fail('Administrator access is required.', 403, 'ADMIN_REQUIRED');
  return $user;
}

function sanitizeHtml(string $html): string {
  if (!class_exists('DOMDocument')) {
    return strip_tags($html, '<p><br><strong><em><u><s><span><ul><ol><li><pre><code>');
  }
  $doc = new DOMDocument();
  libxml_use_internal_errors(true);
  // DOMDocument assumes ISO-8859-1 unless an encoding is declared. The XML
  // declaration makes it preserve UTF-8 punctuation, accents, and emoji.
  $doc->loadHTML('<?xml encoding="UTF-8"><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
  $allowed = ['p', 'br', 'strong', 'em', 'u', 's', 'span', 'ul', 'ol', 'li', 'pre', 'code', 'div', 'blockquote', 'label', 'input', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col'];
  $walker = function (DOMNode $node) use (&$walker, $allowed): void {
    foreach (iterator_to_array($node->childNodes) as $child) {
      if ($child instanceof DOMElement && !in_array(strtolower($child->tagName), $allowed, true)) {
        while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
        $node->removeChild($child);
        continue;
      }
      if ($child instanceof DOMElement) {
        $tag = strtolower($child->tagName);
        if ($tag === 'input' && strtolower($child->getAttribute('type')) !== 'checkbox') {
          $node->removeChild($child);
          continue;
        }
        foreach (iterator_to_array($child->attributes) as $attribute) {
          $name = strtolower($attribute->name);
          $value = strtolower(trim($attribute->value));
          $isSafeTaskAttribute = ($tag === 'ul' && $name === 'data-type' && $value === 'tasklist')
            || ($tag === 'li' && $name === 'data-type' && $value === 'taskitem')
            || ($tag === 'li' && $name === 'data-checked' && in_array($value, ['', 'true', 'false'], true))
            || ($tag === 'input' && $name === 'type' && $value === 'checkbox')
            || ($tag === 'input' && $name === 'checked');
          $isSafeTableAttribute = (in_array($tag, ['td', 'th'], true) && in_array($name, ['colspan', 'rowspan'], true)
              && ctype_digit($value) && (int)$value >= 1 && (int)$value <= 100)
            || (in_array($tag, ['td', 'th'], true) && $name === 'colwidth'
              && preg_match('/^\d+(?:,\d+)*$/', $value)
              && count(array_filter(explode(',', $value), fn($width) => (int)$width < 1 || (int)$width > 600)) === 0)
            || ($tag === 'col' && $name === 'width' && ctype_digit($value) && (int)$value >= 1 && (int)$value <= 5000);
          $isSafeTableStyle = (in_array($tag, ['td', 'th', 'col'], true) && $name === 'style');
          if (!(($tag === 'span' && $name === 'style') || $isSafeTaskAttribute || $isSafeTableAttribute || $isSafeTableStyle)) $child->removeAttributeNode($attribute);
        }
        if ($child->hasAttribute('style')) {
          $style = $child->getAttribute('style');
          // Browsers commonly serialize the palette's hex colors as rgb(...).
          // Permit only numeric RGB/RGBA values alongside the existing safe
          // color, font-size, and font-family formats.
          if ($tag === 'span') {
            $safe = preg_match_all('/(?:color|font-size|font-family)\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\(\s*[0-9.% ,\/]+\s*\)|[a-zA-Z0-9 ,.-]+)(?:\s*;|$)/', $style, $matches)
              ? implode(';', $matches[0]) : '';
          } elseif (in_array($tag, ['td', 'th'], true) && preg_match('/^\s*height\s*:\s*(\d{1,3})px\s*;?\s*$/i', $style, $matches) && (int)$matches[1] >= 32 && (int)$matches[1] <= 400) {
            $safe = 'height: ' . (int)$matches[1] . 'px';
          } elseif ($tag === 'col' && preg_match('/^\s*(?:min-)?width\s*:\s*(\d{1,4})px\s*;?\s*$/i', $style, $matches) && (int)$matches[1] >= 1 && (int)$matches[1] <= 5000) {
            $safe = strtolower(str_contains(strtolower($style), 'min-width') ? 'min-width' : 'width') . ': ' . (int)$matches[1] . 'px';
          } else {
            $safe = '';
          }
          $safe ? $child->setAttribute('style', $safe) : $child->removeAttribute('style');
        }
      }
      $walker($child);
    }
  };
  $walker($doc);
  return $doc->saveHTML($doc->documentElement) ?: '';
}

function ownedCategory(PDO $db, int $userId, mixed $category): ?int {
  if ($category === null || $category === '') return null;
  $id = (int)$category;
  $statement = $db->prepare('SELECT id FROM categories WHERE id = ? AND user_id = ? LIMIT 1');
  $statement->execute([$id, $userId]);
  if (!$statement->fetch()) fail('Category not found.', 422, 'INVALID_CATEGORY');
  return $id;
}

function noteData(PDO $db, int $userId, array $data): array {
  $color = (string)($data['color'] ?? '#ffffff');
  if (!preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/', $color)) fail('Invalid note color.');
  return [
    'title' => mb_substr(trim((string)($data['title'] ?? '')), 0, 255),
    'content' => sanitizeHtml((string)($data['content'] ?? '')),
    'color' => $color,
    'is_pinned' => !empty($data['is_pinned']) ? 1 : 0,
    'is_archived' => !empty($data['is_archived']) ? 1 : 0,
    'category_id' => ownedCategory($db, $userId, $data['category_id'] ?? null),
  ];
}

function getNote(PDO $db, int $userId, int $id): array {
  $statement = $db->prepare('SELECT * FROM notes WHERE id = ? AND user_id = ? LIMIT 1');
  $statement->execute([$id, $userId]);
  return $statement->fetch() ?: fail('Note not found.', 404, 'NOT_FOUND');
}

$db = null;

try {
  $db = Database::connection();
  Database::ensureBootstrapAdmin($db, $config);
  $path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
  $path = preg_replace('#^api/?#', '', $path);
  $parts = $path === '' ? [] : explode('/', $path);
  $resource = $parts[0] ?? '';
  $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

  if ($resource === 'auth') {
    $action = $parts[1] ?? '';
    if ($method === 'POST' && $action === 'login') {
      $data = input();
      $email = strtolower(trim((string)($data['email'] ?? '')));
      $password = (string)($data['password'] ?? '');
      $statement = $db->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
      $statement->execute([$email]);
      $user = $statement->fetch();
      if (!$user || !password_verify($password, $user['password_hash'])) {
        fail('The email or password is incorrect.', 401, 'INVALID_CREDENTIALS');
      }
      session_regenerate_id(true);
      $_SESSION['user_id'] = (int)$user['id'];
      $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
      $db->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$user['id']]);
      $user['last_login_at'] = gmdate('Y-m-d H:i:s');
      reply(['user' => publicUser($user), 'csrf_token' => csrfToken()]);
    }
    if ($method === 'GET' && $action === 'me') {
      $user = requireUser($db);
      reply(['user' => publicUser($user), 'csrf_token' => csrfToken()]);
    }
    if ($method === 'POST' && $action === 'logout') {
      requireUser($db);
      requireCsrf();
      $_SESSION = [];
      if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', $params['secure'], $params['httponly']);
      }
      session_destroy();
      reply(null, 204);
    }
    fail('Route not found.', 404, 'NOT_FOUND');
  }

  if ($resource === 'admin') {
    $admin = requireAdmin($db);
    if ($method !== 'GET') requireCsrf();
    if (($parts[1] ?? '') !== 'users') fail('Route not found.', 404, 'NOT_FOUND');
    $id = isset($parts[2]) && ctype_digit($parts[2]) ? (int)$parts[2] : null;
    $action = $parts[3] ?? '';

    if ($method === 'GET' && !$id) {
      $statement = $db->query(
        'SELECT u.id, u.email, u.display_name, u.is_admin, u.last_login_at, u.created_at,
                COUNT(DISTINCT n.id) AS note_count,
                COUNT(DISTINCT c.id) AS category_count
           FROM users u
           LEFT JOIN notes n ON n.user_id = u.id
           LEFT JOIN categories c ON c.user_id = u.id
          GROUP BY u.id, u.email, u.display_name, u.is_admin, u.last_login_at, u.created_at
          ORDER BY u.created_at DESC'
      );
      reply(array_map(static fn(array $row): array => [
        ...publicUser($row),
        'note_count' => (int)$row['note_count'],
        'category_count' => (int)$row['category_count'],
      ], $statement->fetchAll()));
    }

    if ($method === 'POST' && !$id) {
      $data = input();
      $email = strtolower(trim((string)($data['email'] ?? '')));
      $name = trim((string)($data['display_name'] ?? ''));
      $password = (string)($data['password'] ?? '');
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.', 422, 'INVALID_EMAIL');
      if ($name === '' || mb_strlen($name) > 100) fail('Display name is required.', 422, 'INVALID_NAME');
      if (strlen($password) < 8) fail('Password must contain at least 8 characters.', 422, 'WEAK_PASSWORD');
      $statement = $db->prepare('INSERT INTO users (email, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)');
      $statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name, !empty($data['is_admin']) ? 1 : 0]);
      $created = $db->prepare('SELECT * FROM users WHERE id = ?');
      $created->execute([(int)$db->lastInsertId()]);
      reply(publicUser($created->fetch()), 201);
    }

    if ($method === 'PUT' && $id && $action === '') {
      $target = $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
      $target->execute([$id]);
      $targetUser = $target->fetch();
      if (!$targetUser) fail('User not found.', 404, 'NOT_FOUND');

      $data = input();
      $email = strtolower(trim((string)($data['email'] ?? '')));
      $name = trim((string)($data['display_name'] ?? ''));
      $password = (string)($data['password'] ?? '');
      $isAdmin = !empty($data['is_admin']);
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.', 422, 'INVALID_EMAIL');
      if ($name === '' || mb_strlen($name) > 100) fail('Display name is required.', 422, 'INVALID_NAME');
      if ($password !== '' && strlen($password) < 8) fail('A new password must contain at least 8 characters.', 422, 'WEAK_PASSWORD');
      if ($id === (int)$admin['id'] && !$isAdmin) {
        fail('You cannot remove administrator access from your own account.', 422, 'CANNOT_DEMOTE_SELF');
      }
      if (!empty($targetUser['is_admin']) && !$isAdmin) {
        $adminCount = (int)$db->query('SELECT COUNT(*) FROM users WHERE is_admin = 1')->fetchColumn();
        if ($adminCount <= 1) fail('The final administrator cannot be changed to a regular user.', 422, 'LAST_ADMIN');
      }

      if ($password !== '') {
        $statement = $db->prepare('UPDATE users SET email = ?, display_name = ?, is_admin = ?, password_hash = ? WHERE id = ?');
        $statement->execute([$email, $name, $isAdmin ? 1 : 0, password_hash($password, PASSWORD_DEFAULT), $id]);
      } else {
        $statement = $db->prepare('UPDATE users SET email = ?, display_name = ?, is_admin = ? WHERE id = ?');
        $statement->execute([$email, $name, $isAdmin ? 1 : 0, $id]);
      }
      $updated = $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
      $updated->execute([$id]);
      reply(publicUser($updated->fetch()));
    }

    if ($method === 'DELETE' && $id && $action === 'data') {
      $db->beginTransaction();
      $db->prepare('DELETE FROM notes WHERE user_id = ?')->execute([$id]);
      $db->prepare('DELETE FROM categories WHERE user_id = ?')->execute([$id]);
      $db->commit();
      reply(['deleted' => true]);
    }

    if ($method === 'DELETE' && $id && $action === '') {
      if ($id === (int)$admin['id']) fail('You cannot remove your own administrator account.', 422, 'CANNOT_DELETE_SELF');
      $target = $db->prepare('SELECT is_admin FROM users WHERE id = ? LIMIT 1');
      $target->execute([$id]);
      $targetUser = $target->fetch();
      if (!$targetUser) fail('User not found.', 404, 'NOT_FOUND');
      if (!empty($targetUser['is_admin'])) {
        $adminCount = (int)$db->query('SELECT COUNT(*) FROM users WHERE is_admin = 1')->fetchColumn();
        if ($adminCount <= 1) fail('The final administrator cannot be removed.', 422, 'LAST_ADMIN');
      }
      $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
      reply(null, 204);
    }
    fail('Route not found.', 404, 'NOT_FOUND');
  }

  $user = requireUser($db);
  $userId = (int)$user['id'];
  if ($method !== 'GET') requireCsrf();
  $id = isset($parts[1]) && ctype_digit($parts[1]) ? (int)$parts[1] : null;

  if ($resource === 'notes') {
    if ($method === 'GET' && !$id) {
      $statement = $db->prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC');
      $statement->execute([$userId]);
      reply($statement->fetchAll());
    }
    if ($method === 'GET' && $id) reply(getNote($db, $userId, $id));
    if ($method === 'POST' && !$id) {
      $note = noteData($db, $userId, input());
      $note['user_id'] = $userId;
      $statement = $db->prepare(
        'INSERT INTO notes (user_id, title, content, color, is_pinned, is_archived, category_id)
         VALUES (:user_id, :title, :content, :color, :is_pinned, :is_archived, :category_id)'
      );
      $statement->execute($note);
      reply(getNote($db, $userId, (int)$db->lastInsertId()), 201);
    }
    if ($method === 'PUT' && $id) {
      getNote($db, $userId, $id);
      $note = noteData($db, $userId, input());
      $note['id'] = $id;
      $note['user_id'] = $userId;
      $statement = $db->prepare(
        'UPDATE notes SET title=:title, content=:content, color=:color, is_pinned=:is_pinned,
         is_archived=:is_archived, category_id=:category_id WHERE id=:id AND user_id=:user_id'
      );
      $statement->execute($note);
      reply(getNote($db, $userId, $id));
    }
    if ($method === 'DELETE' && $id) {
      getNote($db, $userId, $id);
      $db->prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
      reply(null, 204);
    }
  }

  if ($resource === 'categories') {
    if ($method === 'GET' && !$id) {
      $statement = $db->prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY name');
      $statement->execute([$userId]);
      reply($statement->fetchAll());
    }
    $data = input();
    $name = mb_substr(trim((string)($data['name'] ?? '')), 0, 100);
    if (in_array($method, ['POST', 'PUT'], true) && $name === '') fail('Category name is required.', 422, 'INVALID_NAME');
    if ($method === 'POST' && !$id) {
      $statement = $db->prepare('INSERT INTO categories (user_id, name) VALUES (?, ?)');
      $statement->execute([$userId, $name]);
      $created = $db->prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?');
      $created->execute([(int)$db->lastInsertId(), $userId]);
      reply($created->fetch(), 201);
    }
    if ($method === 'PUT' && $id) {
      $db->prepare('UPDATE categories SET name = ? WHERE id = ? AND user_id = ?')->execute([$name, $id, $userId]);
      $statement = $db->prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?');
      $statement->execute([$id, $userId]);
      $row = $statement->fetch();
      $row ? reply($row) : fail('Category not found.', 404, 'NOT_FOUND');
    }
    if ($method === 'DELETE' && $id) {
      $db->beginTransaction();
      $statement = $db->prepare('SELECT id FROM categories WHERE id = ? AND user_id = ? FOR UPDATE');
      $statement->execute([$id, $userId]);
      if (!$statement->fetch()) {
        $db->rollBack();
        fail('Category not found.', 404, 'NOT_FOUND');
      }
      $db->prepare('UPDATE notes SET category_id = NULL WHERE category_id = ? AND user_id = ?')->execute([$id, $userId]);
      $db->prepare('DELETE FROM categories WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
      $db->commit();
      reply(null, 204);
    }
  }

  fail('Route not found.', 404, 'NOT_FOUND');
} catch (PDOException $error) {
  if ($db instanceof PDO && $db->inTransaction()) $db->rollBack();
  error_log('[Paper Notes] Database error: ' . $error->getMessage());
  $duplicate = $error->getCode() === '23000';
  fail($duplicate ? 'That email or category already exists.' : 'Database error.', $duplicate ? 409 : 500, $duplicate ? 'DUPLICATE_VALUE' : 'DATABASE_ERROR');
} catch (Throwable $error) {
  error_log('[Paper Notes] Server error: ' . $error->getMessage());
  fail('Server error.', 500, 'SERVER_ERROR');
}
