-- Run once when upgrading the multi-user schema, before uploading the new API.
-- Back up the database first. MySQL/MariaDB schema changes commit automatically.
-- Notes, categories, IDs, content, and edited dates are preserved.

CREATE TABLE workspaces (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_workspace_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_workspaces_user_name (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO workspaces (user_id, name) SELECT id, 'Personal' FROM users;

ALTER TABLE categories ADD COLUMN workspace_id INT UNSIGNED NULL AFTER user_id;
ALTER TABLE notes ADD COLUMN workspace_id INT UNSIGNED NULL AFTER user_id;

UPDATE categories c JOIN workspaces w ON w.user_id = c.user_id
  SET c.workspace_id = w.id;
UPDATE notes n JOIN workspaces w ON w.user_id = n.user_id
  SET n.workspace_id = w.id, n.updated_at = n.updated_at;

ALTER TABLE categories
  MODIFY workspace_id INT UNSIGNED NOT NULL,
  DROP INDEX uq_categories_user_name,
  ADD UNIQUE KEY uq_categories_workspace_name (workspace_id, name),
  ADD CONSTRAINT fk_category_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE notes
  MODIFY workspace_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_notes_workspace_updated (user_id, workspace_id, updated_at),
  ADD CONSTRAINT fk_note_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
