<?php

declare(strict_types=1);

// API responses must always be JSON. Send PHP diagnostics to the server log
// instead of mixing HTML warnings into the response body.
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require __DIR__ . '/Database.php';
require __DIR__ . '/NoteContent.php';
require __DIR__ . '/NoteSession.php';

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $config['cors_origin']);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

try {
  NoteSession::start($config);
} catch (Throwable $error) {
  error_log('[Paper Notes] Session error: ' . $error->getMessage());
  http_response_code(503);
  echo json_encode(['error' => 'Your session is temporarily unavailable. Please try again.', 'code' => 'SESSION_UNAVAILABLE']);
  exit;
}

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
  if (strlen($raw) > 5 * 1024 * 1024) fail('This note is too large. Please use smaller images.', 413, 'NOTE_TOO_LARGE');
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
  $user = $statement->fetch();
  if (!$user) {
    NoteSession::logout();
    return null;
  }
  NoteSession::touch();
  return $user;
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

function defaultWorkspace(PDO $db, int $userId): int {
  $statement = $db->prepare('SELECT id FROM workspaces WHERE user_id = ? ORDER BY id LIMIT 1');
  $statement->execute([$userId]);
  $id = $statement->fetchColumn();
  if ($id !== false) return (int)$id;
  // A new account gets Personal on its first visit. The unique name also
  // handles two tabs making their first request at the same time.
  $db->prepare("INSERT IGNORE INTO workspaces (user_id, name) VALUES (?, 'Personal')")->execute([$userId]);
  $statement->execute([$userId]);
  return (int)$statement->fetchColumn();
}

function ownedWorkspace(PDO $db, int $userId, mixed $workspace): int {
  if ($workspace === null || $workspace === '') return defaultWorkspace($db, $userId);
  if ((!is_int($workspace) && !is_string($workspace)) || !ctype_digit((string)$workspace) || (int)$workspace < 1) fail('Workspace not found.', 422, 'INVALID_WORKSPACE');
  $id = (int)$workspace;
  $statement = $db->prepare('SELECT id FROM workspaces WHERE id = ? AND user_id = ? LIMIT 1');
  $statement->execute([$id, $userId]);
  if (!$statement->fetch()) fail('Workspace not found.', 422, 'INVALID_WORKSPACE');
  return $id;
}

function workspaceName(array $data): string {
  if (!is_string($data['name'] ?? null)) fail('Enter a workspace name of 1–60 characters.', 422, 'INVALID_NAME');
  $name = trim((string)($data['name'] ?? ''));
  if ($name === '' || mb_strlen($name) > 60) fail('Enter a workspace name of 1–60 characters.', 422, 'INVALID_NAME');
  return $name;
}

function ownedCategory(PDO $db, int $userId, int $workspaceId, mixed $category): ?int {
  if ($category === null || $category === '') return null;
  $id = (int)$category;
  $statement = $db->prepare('SELECT id FROM categories WHERE id = ? AND user_id = ? AND workspace_id = ? LIMIT 1');
  $statement->execute([$id, $userId, $workspaceId]);
  if (!$statement->fetch()) fail('Category not found.', 422, 'INVALID_CATEGORY');
  return $id;
}

function noteData(PDO $db, int $userId, array $data, ?int $existingWorkspace = null): array {
  if (strlen((string)($data['content'] ?? '')) > 4 * 1024 * 1024) fail('This note is too large. Please use smaller images.', 413, 'NOTE_TOO_LARGE');
  $color = (string)($data['color'] ?? '#ffffff');
  if (!preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/', $color)) fail('Invalid note color.');
  $workspaceId = ownedWorkspace($db, $userId, $data['workspace_id'] ?? $existingWorkspace);
  return [
    'workspace_id' => $workspaceId,
    'title' => mb_substr(trim((string)($data['title'] ?? '')), 0, 255),
    'content' => sanitizeHtml((string)($data['content'] ?? '')),
    'color' => $color,
    'is_pinned' => !empty($data['is_pinned']) ? 1 : 0,
    'is_archived' => !empty($data['is_archived']) ? 1 : 0,
    'category_id' => ownedCategory($db, $userId, $workspaceId, $data['category_id'] ?? null),
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
      NoteSession::login((int)$user['id']);
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
      NoteSession::logout();
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

  if ($resource === 'workspaces') {
    defaultWorkspace($db, $userId);
    if ($method === 'GET' && !$id) {
      $statement = $db->prepare('SELECT id, name FROM workspaces WHERE user_id = ? ORDER BY id');
      $statement->execute([$userId]);
      reply($statement->fetchAll());
    }
    if ($method === 'POST' && !$id) {
      $name = workspaceName(input());
      $db->prepare('INSERT INTO workspaces (user_id, name) VALUES (?, ?)')->execute([$userId, $name]);
      reply(['id' => (int)$db->lastInsertId(), 'name' => $name], 201);
    }
    if ($method === 'PUT' && $id) {
      ownedWorkspace($db, $userId, $id);
      $name = workspaceName(input());
      $db->prepare('UPDATE workspaces SET name = ? WHERE id = ? AND user_id = ?')->execute([$name, $id, $userId]);
      reply(['id' => $id, 'name' => $name]);
    }
    fail('Route not found.', 404, 'NOT_FOUND');
  }

  if ($resource === 'notes') {
    if ($method === 'GET' && !$id) {
      $workspaceId = ownedWorkspace($db, $userId, $_GET['workspace_id'] ?? null);
      $statement = $db->prepare('SELECT * FROM notes WHERE user_id = ? AND workspace_id = ? ORDER BY is_pinned DESC, updated_at DESC');
      $statement->execute([$userId, $workspaceId]);
      reply($statement->fetchAll());
    }
    if ($method === 'GET' && $id) reply(getNote($db, $userId, $id));
    if ($method === 'POST' && !$id) {
      $note = noteData($db, $userId, input());
      $note['user_id'] = $userId;
      $statement = $db->prepare(
        'INSERT INTO notes (user_id, workspace_id, title, content, color, is_pinned, is_archived, category_id)
         VALUES (:user_id, :workspace_id, :title, :content, :color, :is_pinned, :is_archived, :category_id)'
      );
      $statement->execute($note);
      reply(getNote($db, $userId, (int)$db->lastInsertId()), 201);
    }
    if ($method === 'PUT' && $id) {
      $existing = getNote($db, $userId, $id);
      $note = noteData($db, $userId, input(), (int)$existing['workspace_id']);
      $note['id'] = $id;
      $note['user_id'] = $userId;
      $statement = $db->prepare(
        'UPDATE notes SET workspace_id=:workspace_id, title=:title, content=:content, color=:color, is_pinned=:is_pinned,
         is_archived=:is_archived, category_id=:category_id WHERE id=:id AND user_id=:user_id'
      );
      $statement->execute($note);
      reply(getNote($db, $userId, $id));
    }
    if ($method === 'POST' && $id && ($parts[2] ?? '') === 'move') {
      getNote($db, $userId, $id);
      $data = input();
      if (empty($data['workspace_id'])) fail('Choose a destination workspace.', 422, 'INVALID_WORKSPACE');
      $workspaceId = ownedWorkspace($db, $userId, $data['workspace_id']);
      $db->prepare('UPDATE notes SET category_id = CASE WHEN workspace_id = ? THEN category_id ELSE NULL END, workspace_id = ? WHERE id = ? AND user_id = ?')->execute([$workspaceId, $workspaceId, $id, $userId]);
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
      $workspaceId = ownedWorkspace($db, $userId, $_GET['workspace_id'] ?? null);
      $statement = $db->prepare('SELECT * FROM categories WHERE user_id = ? AND workspace_id = ? ORDER BY name');
      $statement->execute([$userId, $workspaceId]);
      reply($statement->fetchAll());
    }
    $data = input();
    $name = mb_substr(trim((string)($data['name'] ?? '')), 0, 100);
    if (in_array($method, ['POST', 'PUT'], true) && $name === '') fail('Category name is required.', 422, 'INVALID_NAME');
    if ($method === 'POST' && !$id) {
      $workspaceId = ownedWorkspace($db, $userId, $data['workspace_id'] ?? null);
      $statement = $db->prepare('INSERT INTO categories (user_id, workspace_id, name) VALUES (?, ?, ?)');
      $statement->execute([$userId, $workspaceId, $name]);
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
  $duplicateMessage = match ($resource ?? '') {
    'workspaces' => 'You already have a workspace with that name.',
    'categories' => 'This workspace already has a category with that name.',
    default => 'That email address is already in use.',
  };
  fail($duplicate ? $duplicateMessage : 'Database error.', $duplicate ? 409 : 500, $duplicate ? 'DUPLICATE_VALUE' : 'DATABASE_ERROR');
} catch (Throwable $error) {
  error_log('[Paper Notes] Server error: ' . $error->getMessage());
  fail('Server error.', 500, 'SERVER_ERROR');
}
