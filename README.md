# Paper Notes

A multi-user notes application built with React, Vite, TipTap, native PHP, and MySQL. Notes are stored only in MySQL; there is no IndexedDB or browser persistence.

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

## Administration

Sign in with an administrator account and open `/admin/`. Administrators can:

- create normal or administrator accounts;
- edit a user's display name, email, administrator role, or password;
- see each user's last login, note count, and category count;
- permanently delete a user's notes and categories while keeping the account;
- permanently remove another user's account and all of its data.

There is intentionally no public account-registration page.

## Production build / shared PHP hosting

Build the frontend on your computer:

```bash
npm run build
```

Upload the **contents** of `dist/` to the site's public directory, then upload the `api/` directory next to `index.html`. Do not upload `node_modules`. Import `api/schema.sql` through your host's MySQL/phpMyAdmin tools and update `api/config.php` with the production credentials.

The generated `.htaccess` supports `/admin/` and other client-side routes on Apache/Hostinger. HTTPS is strongly recommended so session cookies and passwords are protected in transit.
