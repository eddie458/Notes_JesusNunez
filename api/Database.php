<?php

declare(strict_types=1);

final class Database {
  private static ?PDO $connection = null;

  public static function connection(): PDO {
    if (self::$connection) return self::$connection;

    $config = require __DIR__ . '/config.php';
    $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
    self::$connection = new PDO($dsn, $config['user'], $config['pass'], [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    self::$connection->exec("SET time_zone = '+00:00'");
    return self::$connection;
  }

  public static function ensureBootstrapAdmin(PDO $db, array $config): void {
    $email = strtolower(trim((string)$config['admin_email']));
    $name = trim((string)$config['admin_name']) ?: 'Administrator';
    $password = (string)$config['admin_password'];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
      throw new RuntimeException('ADMIN_EMAIL must be valid and ADMIN_PASSWORD must contain at least 8 characters.');
    }

    $placeholder = $db->query("SELECT id FROM users WHERE password_hash = '' ORDER BY id LIMIT 1")->fetch();
    if ($placeholder) {
      $statement = $db->prepare('UPDATE users SET email = ?, display_name = ?, password_hash = ?, is_admin = 1 WHERE id = ?');
      $statement->execute([$email, $name, password_hash($password, PASSWORD_DEFAULT), $placeholder['id']]);
      return;
    }

    $statement = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $statement->execute([$email]);
    if (!$statement->fetch()) {
      $insert = $db->prepare('INSERT INTO users (email, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)');
      $insert->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name]);
    }
  }
}
