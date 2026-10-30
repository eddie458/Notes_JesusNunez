<?php

declare(strict_types=1);

final class NoteSession {
  private const DEFAULT_LIFETIME = 30 * 24 * 60 * 60;
  private static int $lifetime = self::DEFAULT_LIFETIME;

  public static function start(array $config): void {
    $lifetime = $config['session_lifetime'] ?? (getenv('SESSION_LIFETIME') ?: self::DEFAULT_LIFETIME);
    $validated = filter_var($lifetime, FILTER_VALIDATE_INT, ['options' => ['min_range' => 60, 'max_range' => 365 * 24 * 60 * 60]]);
    if ($validated === false) throw new RuntimeException('SESSION_LIFETIME must be between 60 seconds and one year.');
    self::$lifetime = $validated;

    // Hostinger's app is public_html/notes/api. Keep session files in the
    // private website directory, isolated from other sites' shorter GC limits.
    $defaultPath = dirname(__DIR__, 3) . '/.paper-notes-sessions-' . substr(hash('sha256', __DIR__), 0, 16);
    $path = (string)($config['session_save_path'] ?? (getenv('SESSION_SAVE_PATH') ?: $defaultPath));
    if ((!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) || !is_writable($path)) {
      throw new RuntimeException('The private Paper Notes session directory is not writable. Configure SESSION_SAVE_PATH.');
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.save_handler', 'files');
    ini_set('session.gc_maxlifetime', (string)self::$lifetime);
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '100');
    session_save_path($path);
    session_name($config['session_name']);
    session_set_cookie_params([
      'lifetime' => self::$lifetime,
      'path' => '/',
      'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    if (!session_start()) throw new RuntimeException('The Paper Notes session could not be opened.');

    // Enforce expiry ourselves as well: garbage collection is probabilistic.
    if (isset($_SESSION['user_id']) && ((int)($_SESSION['expires_at'] ?? 0) <= time()
      || (int)($_SESSION['last_activity_at'] ?? 0) + self::$lifetime <= time())) {
      $_SESSION = [];
      session_regenerate_id(true);
    }
  }

  public static function login(int $userId): void {
    if (!session_regenerate_id(true)) throw new RuntimeException('The session could not be renewed.');
    $_SESSION = ['user_id' => $userId, 'csrf_token' => bin2hex(random_bytes(32))];
    self::touch();
  }

  public static function touch(): void {
    if (empty($_SESSION['user_id'])) return;
    $_SESSION['last_activity_at'] = time();
    $_SESSION['expires_at'] = $_SESSION['last_activity_at'] + self::$lifetime;
    self::cookie(session_id(), $_SESSION['expires_at']);
  }

  public static function logout(): void {
    $_SESSION = [];
    self::cookie('', time() - 3600);
    session_destroy();
  }

  private static function cookie(string $value, int $expires): void {
    $params = session_get_cookie_params();
    // Keep one definitive cookie per response. A renewal followed by logout
    // must not leave clients processing conflicting expiry headers.
    $otherCookies = array_filter(headers_list(), static fn(string $header): bool =>
      strncasecmp($header, 'Set-Cookie:', 11) === 0
      && !preg_match('/^Set-Cookie:\s*' . preg_quote(session_name(), '/') . '=/i', $header));
    header_remove('Set-Cookie');
    foreach ($otherCookies as $header) header($header, false);
    setcookie(session_name(), $value, [
      'expires' => $expires,
      'path' => $params['path'],
      'domain' => $params['domain'] ?? '',
      'secure' => $params['secure'],
      'httponly' => $params['httponly'],
      'samesite' => $params['samesite'],
    ]);
  }
}
