-- Run this file only when upgrading the earlier single-user schema.
-- Existing notes and categories are assigned to the first administrator.

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO users (id, email, password_hash, display_name, is_admin)
VALUES (1, 'admin@notes.local', '', 'Administrator', 1);

ALTER TABLE categories ADD COLUMN user_id INT UNSIGNED NULL AFTER id;
UPDATE categories SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE categories MODIFY user_id INT UNSIGNED NOT NULL;
ALTER TABLE categories DROP INDEX name;
ALTER TABLE categories ADD CONSTRAINT fk_category_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE categories ADD UNIQUE KEY uq_categories_user_name (user_id, name);
ALTER TABLE categories ADD INDEX idx_categories_user (user_id);

ALTER TABLE notes ADD COLUMN user_id INT UNSIGNED NULL AFTER id;
UPDATE notes SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE notes MODIFY user_id INT UNSIGNED NOT NULL;
ALTER TABLE notes ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER is_pinned;
ALTER TABLE notes ADD CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notes ADD INDEX idx_notes_user_updated (user_id, updated_at);
ALTER TABLE notes ADD INDEX idx_notes_user_archived (user_id, is_archived);

-- The next API request replaces the placeholder administrator credentials
-- using ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME.
