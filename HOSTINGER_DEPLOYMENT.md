# Paper Notes on Hostinger

Live app: https://notes.jesusnunez.top

The latest working-tree frontend and PHP API were deployed on October 8, 2026,
using Hostinger File Manager and phpMyAdmin. The Tracker deployment document was
used as a guide; Paper Notes keeps its existing public API directory and private
HTTP access rules. Production runs the built frontend and PHP 8.3, without Vite
or Node.js servers.

## Production layout

```text
Website directory/
├── notes_predeploy_backup_20261008/
│   └── notes/                    Complete copy of the previous app
├── notes-update.zip              Uploaded update; outside public_html
└── public_html/
    └── notes/                    notes.jesusnunez.top document root
        ├── index.html
        ├── paper-notes-favicon.svg
        ├── paper-notes-favicon.png
        ├── assets/
        ├── .htaccess
        └── api/
            ├── config.php        Existing production configuration, preserved
            ├── index.php
            ├── Database.php
            ├── NoteContent.php
            └── .htaccess
```

The database is `u560890700_paper_notes`. Production database and administrator
credentials remain in the existing `api/config.php`; no password was changed,
committed, or included in the release packages. HTTP requests redirect to HTTPS,
and session cookies are Secure, HttpOnly, and SameSite=Lax.

The routing rules serve `/api/*` through PHP and `/admin/` through React. They
disable directory listings, block SQL exports, archives, logs, hidden files, and
the old `_Backup` directory, and deny direct HTTP access to PHP includes such as
`api/config.php`. The existing schema/migration files on the host are blocked.
Other subdomains were not changed.

## Database upgrade completed

Before the update, the live database had 39 notes, 3 categories, and 1 user, and
did not have workspaces. A complete SQL export was saved before changes:

`/Users/jesusn/.codex/notes-deployments/2026-10-08/paper-notes-before-20261008.sql`

An isolated local MariaDB instance imported that export, then applied
`api/migrate-workspaces.sql`. All original note, category, and user fields were
compared before and after; the migration preserved them, including note content
and edited dates. The existing migration test passed 15 checks, and the workspace
API integration test passed 64 checks against a separate disposable database.

The workspace migration was then imported once into the Hostinger database.
phpMyAdmin confirmed all 8 queries succeeded. It assigned the existing notes and
categories to the account's Personal workspace. No fresh schema or administrator
seed was imported.

**Do not run either migration again on this installation.**

## Build and update packages

```sh
npm run build
node deployment/hostinger/package.mjs /absolute/path/to/new/empty/output-directory
```

The packaging script checks PHP syntax and creates:

- `notes-frontend.zip`: built frontend files, including routing and favicons.
- `notes-backend-update.zip`: API implementation and routing rules.
- `notes-update.zip`: both parts, with backend files under `api/`.
- `manifest.json`: file sizes and SHA-256 hashes.

These packages are for an **existing installation**. They exclude `config.php`,
SQL exports and migrations, tests, Git files, and `node_modules`.

For an update, first back up the complete current `public_html/notes` directory
outside `public_html`. Upload the combined ZIP to the private website directory.
In File Manager, choose Extract, select `public_html` as the destination, enter
`notes` as the folder name, and enable overwriting existing files. This merges
only packaged files and preserves production `api/config.php`. Keep previous
hashed assets for rollback. For a frontend-only update, use the frontend archive.

If an update needs a future database migration, export the database first, test
the migration on an isolated copy, and apply it before uploading code that needs
the new schema. Never replace production data with a development database.

## Verification

For the next update, include `api/NoteSession.php` with `api/index.php` (the
packaging script includes it automatically). This adds a rolling 30-day sign-in
and private session storage outside `public_html`, with no database changes.
PHP must be able to create the private session directory; `SESSION_SAVE_PATH`
can override its location. The first login after this update is required once
per device because the previous shared session storage is no longer used.

The deployment was checked over HTTPS:

- Public HTML, both new hashed assets, and both favicons matched the release bytes.
- `/admin/` served the built frontend; the browser reported no errors or warnings.
- Existing administrator login and authenticated workspace, note, category, and
  administrator-user requests succeeded against the live database.
- Personal contained all 39 notes and 3 categories; administration still showed
  one user. Full comparisons with the exported database matched 38 notes and all
  categories. Note 42 received a newer content edit at 15:25:58 UTC during the
  deployment; that edit was retained. All its other fields matched the export.
- Requests without authentication returned 401; a workspace mutation without a
  CSRF token returned 403; an invalid workspace returned 422.
- Direct requests for configuration/includes, SQL files, `.htaccess`, `_Backup`,
  and directory listings returned 403. HTTP redirected to HTTPS.
- PHP syntax and the 44 content persistence/sanitization checks passed locally.

For rollback, restore the previous code from the private backup. The prior API
does not support workspace changes, so use it only before creating additional
workspaces. Restoring a database export replaces newer data and requires a
separate, deliberate recovery decision.
