<?php
declare(strict_types=1);

// This test requires an empty, disposable database with this exact name.
$dsn = (string)getenv('PAPER_NOTES_TEST_DSN');
if (!str_contains($dsn, 'dbname=paper_notes_workspace_migration_test')) throw new RuntimeException('Set PAPER_NOTES_TEST_DSN to an empty paper_notes_workspace_migration_test database.');
$db = new PDO($dsn, (string)getenv('PAPER_NOTES_TEST_USER'), (string)getenv('PAPER_NOTES_TEST_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
if ($db->query('SHOW TABLES')->fetch()) throw new RuntimeException('The migration test database must be empty.');
$db->exec(file_get_contents(__DIR__ . '/fixtures/pre-workspaces.sql'));
$db->exec("INSERT INTO users (id,email,password_hash,display_name) VALUES (1,'one@example.test','test-only','One'),(2,'two@example.test','test-only','Two')");
$db->exec("INSERT INTO categories (id,user_id,name) VALUES (1,1,'Work'),(2,2,'Work')");
$insert = $db->prepare('INSERT INTO notes (user_id,title,content,color,is_pinned,is_archived,category_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
foreach ([[1,'Short note','<p>Keep me.</p>','#fffdf7',0,0,1], [1,'Pinned archive','<p><strong>Keep formatting.</strong></p>','#d4f4f3',1,1,null], [2,'Another account','<p>Separate content.</p>','#eee5ff',1,0,2]] as $note) $insert->execute([...$note,'2025-01-01 10:00:00','2025-02-01 11:00:00']);
$notesBefore = $db->query('SELECT * FROM notes ORDER BY id')->fetchAll();
$categoriesBefore = $db->query('SELECT * FROM categories ORDER BY id')->fetchAll();
$db->exec(file_get_contents(__DIR__ . '/../api/migrate-workspaces.sql'));
$workspaces = $db->query('SELECT * FROM workspaces ORDER BY user_id')->fetchAll();
$checks = 0;
$check = function (bool $condition, string $message) use (&$checks): void { if (!$condition) throw new RuntimeException($message); $checks++; };
$check(count($workspaces) === 2, 'Migration creates one workspace per existing user.');
foreach ($workspaces as $workspace) $check($workspace['name'] === 'Personal', 'Existing users start in Personal.');
$notesAfter = $db->query('SELECT * FROM notes ORDER BY id')->fetchAll();
$check(count($notesAfter) === count($notesBefore), 'Every note is retained.');
foreach ($notesAfter as $index => $note) {
  $workspace = array_values(array_filter($workspaces, fn($item) => $item['user_id'] === $note['user_id']))[0];
  $check($note['workspace_id'] === $workspace['id'], 'Notes belong to their own user’s Personal workspace.');
  unset($note['workspace_id']);
  $check($note === $notesBefore[$index], 'All original note fields, including edited dates, are unchanged.');
}
foreach ($db->query('SELECT * FROM categories ORDER BY id')->fetchAll() as $index => $category) {
  $workspace = array_values(array_filter($workspaces, fn($item) => $item['user_id'] === $category['user_id']))[0];
  $check($category['workspace_id'] === $workspace['id'], 'Categories stay with their own user.');
  unset($category['workspace_id']);
  $check($category === $categoriesBefore[$index], 'Category IDs and names are unchanged.');
}
$db->exec("INSERT INTO workspaces (user_id,name) VALUES (1,'Work')");
$newWorkspace = $db->lastInsertId();
$db->prepare("INSERT INTO categories (user_id,workspace_id,name) VALUES (1,?,'Work')")->execute([$newWorkspace]);
$check((int)$db->query("SELECT COUNT(*) FROM categories WHERE user_id = 1 AND name = 'Work'")->fetchColumn() === 2, 'The same category name can be used in separate workspaces.');
echo "$checks workspace migration checks passed.\n";
