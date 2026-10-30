# Paper Notes

A multi-user notes application built with React, Vite, TipTap, native PHP, and MySQL. Note content is stored only in MySQL. The browser remembers appearance and the last selected workspace, separately for each account.

## Requirements

- Node.js 20 or newer and npm (development/build only)
- PHP 8.1 or newer with the PDO MySQL and DOM extensions
- MySQL 8 or MariaDB 10.5+

Composer is not used.

## Database setup

Create an empty database, then import the fresh schema:

```bash
mysql -u root -p -e "CREATE DATABASE notes_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p notes_app < api/schema.sql
```

If you are upgrading the earlier single-user version instead, back up the database and import this migration once:

```bash
mysql -u root -p notes_app < api/migrate-multi-user.sql
```

When upgrading an existing multi-user database, back it up and run `api/migrate-workspaces.sql` once **before uploading the updated API**. This creates a Personal workspace for each user and assigns their existing notes and categories to it, preserving contents, IDs, and edited dates. An upgrade from the single-user version needs both migrations, in order. Fresh installations using `api/schema.sql` already include workspaces.

Configure the database and first administrator in `api/config.php`, or set these environment variables:

```text
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
```

The first API request creates the initial administrator. The development defaults are `admin@notes.local` / `ChangeMe123!`. Change these before exposing the application publicly.

## Run locally

Install frontend dependencies once:

```bash
npm install
```

Open two terminal windows in the project directory. Start the native PHP API in the first:

```bash
npm run dev:api
```

Start Vite in the second:

```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to PHP at `127.0.0.1:8080`.

## Sign-in persistence

Sign-ins last for **30 days of inactivity**. Each authenticated API request
renews the browser cookie and server expiry. Returning to a background tab
checks the session and refreshes its CSRF token without closing the editor.
Temporary connection/server errors preserve the current screen; startup errors
show a retry button instead of a misleading login page. Signing out immediately
invalidates that browser's session.

Session files use a private, app-specific directory outside Hostinger's
`public_html`, separate from other apps' shorter PHP cleanup policies. Both
the cookie lifetime and server cleanup lifetime default to 2,592,000 seconds.
HTTPS cookies remain Secure, HttpOnly, and SameSite=Lax. Authentication tokens
are not stored in browser local storage.

Optional environment variables (or matching `session_lifetime` and
`session_save_path` entries in the existing PHP config):

- `SESSION_LIFETIME`: inactivity duration in seconds; defaults to 2,592,000.
- `SESSION_SAVE_PATH`: an app-specific private writable directory. The default
  is `.paper-notes-sessions-<app-hash>` three levels above `api/`, which is the
  private website directory for Hostinger's `public_html/notes/api` layout.
  For other layouts or local development, explicitly set a private path.

Deploy `api/NoteSession.php` alongside `api/index.php`; the existing Hostinger
packaging script includes both. No database migration is required. Because
storage is isolated from the old shared directory, existing devices will need
to sign in once after this update. The longer lifetime applies after that login.

## Appearance and note editing

Use the **Workspace** selector below the logo to switch libraries. All notes, pinned notes, archive, categories, and search are limited to the selected workspace. The first visit opens Personal; subsequent visits reopen the last valid workspace selected on that browser for the signed-in account. If that preference is unavailable, the app falls back to the first workspace.

Choose **New workspace** to create another library, or the pencil beside it to rename the current workspace. A note's **Move to workspace** action moves it without changing its content, colors, or pinned/archived status. Its old category is cleared because categories belong to a workspace; choose a category in the destination after moving. New notes and categories are created inside the current workspace.

Choose **Linen**, **Ocean**, **Rose**, or **Midnight** from the color palette menu in the header. Use the arrow keys to browse palettes and Enter to choose one. The selected appearance is remembered on the current browser; notes remain stored in MySQL.

Grid view arranges notes in responsive masonry columns: short notes take less space, and each column packs independently with consistent spacing. The layout updates when notes change or images load. Pinned notes stay in their own section, and list view remains available.

The note editor offers twelve font choices, seven text sizes, preset colors, and custom color pickers with hex input for both note backgrounds and selected text. Formatting also works at the text cursor for what you type next. The toolbar includes lists, checklists, quotes, code, tables with row and column sizing, and undo/redo.

Use **Add image** to choose a PNG, JPG, or WebP file (up to 10 MB) or enter an HTTPS image link. Uploaded images are resized to fit within 1600 pixels, embedded in the note content, and saved in MySQL without a separate upload folder or database migration. Embedded images are limited to 2 MB each and note content to 4 MB. Select an image to drag its bottom-right corner, enter a width (64–1600 pixels), choose a size preset, fit it to the note, or remove it. Arrow keys on the resize handle adjust width by 10 pixels (40 with Shift); Home and End choose the smallest width and the available note width. Proportions are preserved, saved widths survive reopening, and images fit smaller screens. Linked images require their source to remain available.

Run the content persistence and sanitization checks with:

```bash
php tests/note-content.php
```

`tests/workspaces-api.py` exercises workspace isolation, note movement, validation, CSRF, and account ownership against a disposable local API database. `tests/workspaces-migration.php` checks the upgrade against an empty disposable MariaDB/MySQL database, including preservation of existing notes and edited dates. Their required test configuration is documented at the top of each file.

## Administration

Sign in with an administrator account and open `/admin/`. Administrators can:

- create normal or administrator accounts;
- edit a user's display name, email, administrator role, or password;
- see each user's last login, note count, and category count;
- permanently delete a user's notes and categories while keeping the account;
- permanently remove another user's account and all of its data.

There is intentionally no public account-registration page.

## Production build / shared PHP hosting

The Hostinger deployment, backup locations, completed workspace migration, and
safe update commands are documented in [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md).

Build the frontend on your computer:

```bash
npm run build
```

Upload the **contents** of `dist/` to the site's public directory, then upload the `api/` directory next to `index.html`. Do not upload `node_modules`. For a fresh installation, import `api/schema.sql` through your host's MySQL/phpMyAdmin tools and configure `api/config.php`. For an existing multi-user installation, back up the database, run `api/migrate-workspaces.sql` once before uploading the updated API, and preserve the hosting credentials in `api/config.php`.

The generated `.htaccess` supports `/admin/` and other client-side routes on Apache/Hostinger. HTTPS is strongly recommended so session cookies and passwords are protected in transit.
