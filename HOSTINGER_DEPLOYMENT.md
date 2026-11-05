# Paper Notes on Hostinger

Live app: https://notes.jesusnunez.top

Commit `c921a91` was deployed on November 5, 2026, using Hostinger File Manager.
It updated only the built frontend, so formatting inside code blocks and quotes
survives reopening a note. The October 29, 2026 update deployed commit
`8702060`, which updated the frontend and PHP API and added rolling 30-day
sign-in. The October 8, 2026 update added workspaces from the working tree and
applied the workspace migration through phpMyAdmin. The Tracker deployment
document was used as a guide; Paper Notes keeps its existing public API
directory and private HTTP access rules. Production runs the built frontend and
PHP 8.3, without Vite or Node.js servers.

## Production layout

```text
Website directory/
├── .paper-notes-sessions-<hash>/ Private sign-in sessions, mode 0700
├── notes_predeploy_backup_20261008/
│   └── notes/                    Copy of the app before the October 8 update
├── notes_predeploy_backup_20261029/
│   └── notes/                    Copy of the app before the October 29 update
├── notes_predeploy_backup_20261105/
│   └── notes/                    Copy of the app before the November 5 update
├── notes-update.zip              October 8 package; outside public_html
├── notes-update-20261029.zip     October 29 package; outside public_html
├── notes-frontend-20261105.zip   November 5 package; outside public_html
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
            ├── NoteSession.php
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

## Workspace database upgrade (October 8, 2026)

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
outside `public_html`: in File Manager, create `notes_predeploy_backup_YYYYMMDD`
in the website directory and copy `public_html/notes` into it. Upload the
combined ZIP to the private website directory under a dated name, such as
`notes-update-20261029.zip`, so it does not replace an earlier archive. In File
Manager, choose Extract, select `public_html` as the destination, enter `notes`
as the folder name, and enable overwriting existing files. This merges only
packaged files and preserves production `api/config.php`. Keep previous hashed
assets for rollback. For a frontend-only update, use the frontend archive.

If an update needs a future database migration, export the database first, test
the migration on an isolated copy, and apply it before uploading code that needs
the new schema. Never replace production data with a development database.

## November 5, 2026 update

This frontend-only update deployed commit `c921a91` from `notes-frontend.zip`,
uploaded as `notes-frontend-20261105.zip`. It replaced `index.html` and added
the hashed assets `index-B5N99HgL.js` and `index-DPNpAR3A.css`. The API, routing
rules, favicons, and database were unchanged.

Reopening a note used to read a code block's `<code>` wrapper as inline code,
which excludes all other formatting, and the next save erased that formatting
from the database. Code blocks no longer accept the inline code format, and
inline code now combines with other formatting, including inside quotes. Italic
text inside a quote now appears upright, because quotes are italic by default.
Notes saved after reopening lost that formatting permanently and need it
reapplied; formatting still in the database returns when the note opens.

`index.html` is served without cache rules, so a device can keep the previous
frontend until it refreshes. Refresh each device after an update. When hashing
server files through File Manager in a browser, bypass the browser cache, which
can return the previous copy.

The deployment was checked:

- Locally, the production bundle kept 8 formats in 9 locations, including code
  blocks and quotes, through two save and reopen cycles on a disposable
  database. The 67 content and 29 code formatting checks passed.
- The backup had the same 39 files and 10,827,162 bytes as the live directory,
  including `api/config.php`.
- The uploaded archive matched the local package's SHA-256. After extraction,
  all 11 files in the manifest matched, `api/config.php` matched the backup, and
  `public_html/notes` held 41 files: the previous 39 plus the two new assets.
- Over HTTPS, the HTML, both new hashed assets, and both favicons matched the
  release bytes, and the previous assets remained available. `/admin/` served
  the built frontend, and a signed-in browser loaded the new bundle.
- A request without authentication returned 401. Direct requests for
  `api/config.php`, the other includes, `api/schema.sql`, `.htaccess`,
  `_Backup`, and directory listings returned 403. HTTP redirected to HTTPS.
- Editing and saving real notes were not tested during the deployment.

## October 29, 2026 update

This update deployed commit `8702060` with no database changes. It replaced
`index.html`, `api/index.php`, and `api/NoteContent.php`, which now preserves
text highlights. It added `api/NoteSession.php` and the hashed assets
`index-Bl92wdMb.js` and `index-DPDh9A09.css`. The routing rules, favicons, and
`api/Database.php` were unchanged.

`api/NoteSession.php` adds a rolling 30-day sign-in. Its session files are in
`.paper-notes-sessions-<hash>` in the private website directory, which the API
created on its first request after the update; `SESSION_SAVE_PATH` can override
the location. Sign-ins from before the update ended, so each device must sign in
once.

The deployment was checked:

- Locally, a fresh build of the commit matched the committed `dist/` byte for
  byte. PHP syntax and the 56 content persistence/sanitization checks passed.
- The backup had the same 36 files and 10,005,233 bytes as the live directory,
  including `api/config.php`.
- The uploaded archive matched the local package's SHA-256. After extraction,
  all 11 packaged files matched the manifest hashes, `api/config.php` matched
  the backup, and `public_html/notes` held 39 files: the previous 36 plus
  `api/NoteSession.php` and the two new assets.
- Over HTTPS, the HTML, both new hashed assets, and both favicons matched the
  release bytes. `/admin/` served the built frontend, and the app rendered its
  sign-in page.
- A request without authentication returned 401, not the 503 the API returns
  when it cannot write sessions; the session directory has mode 0700. The
  session cookie is Secure, HttpOnly, and SameSite=Lax, with a 30-day Max-Age.
- Direct requests for `api/config.php`, `api/NoteSession.php` and the other
  includes, `api/schema.sql`, `.htaccess`, `_Backup`, and directory listings
  returned 403. HTTP redirected to HTTPS.
- Signed-in requests (notes, workspaces, editing) were not tested during the
  deployment.

## October 8, 2026 update

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

## Rollback

To roll back the November 5 update, copy `index.html` from
`notes_predeploy_backup_20261105/notes` back into `public_html/notes`. The
previous hashed assets are still on the server and the API did not change, but
the code block formatting bug returns.

For older updates, copy the matching private backup back into
`public_html/notes`. Rolling back the October 29 update with
`notes_predeploy_backup_20261029` needs no database change, but devices must
sign in again because that API uses PHP's shared session storage. The October 8
backup predates workspaces: its API does not support workspace changes, so use
it only before creating additional workspaces. Restoring a database export
replaces newer data and requires a separate, deliberate recovery decision.
