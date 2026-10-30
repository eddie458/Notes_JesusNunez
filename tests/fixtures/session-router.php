<?php

// Local test harness only. The deployment packager excludes tests entirely.
$testDirectory = getenv('PAPER_NOTES_SESSION_TEST_DIR') ?: '';
if (!str_starts_with($testDirectory, '/private/tmp/paper-notes-session-tests-')) {
  http_response_code(500);
  exit('An isolated session test directory is required.');
}
header('X-Paper-Notes-Test-Fixture: sessions');
$mode = @file_get_contents($testDirectory . '/auth-mode');
if (str_starts_with($_SERVER['REQUEST_URI'] ?? '', '/api/auth/me')) {
  file_put_contents($testDirectory . '/auth-events', ($mode ?: 'normal') . "\n", FILE_APPEND);
}
if (str_starts_with($_SERVER['REQUEST_URI'] ?? '', '/api/auth/me') && in_array($mode, ['offline', 'expired'], true)) {
  header('Content-Type: application/json');
  http_response_code($mode === 'offline' ? 503 : 401);
  echo json_encode(['error' => 'Simulated session check failure.', 'code' => $mode === 'offline' ? 'SESSION_UNAVAILABLE' : 'UNAUTHENTICATED']);
  exit;
}
if (($_SERVER['HTTP_X_TEST_HTTPS'] ?? '') === 'yes') $_SERVER['HTTPS'] = 'on';
require $testDirectory . '/api/index.php';
