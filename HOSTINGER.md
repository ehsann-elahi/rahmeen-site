# Hostinger deployment

The selected setup is PHP 8.2 or newer with MySQL/MariaDB, HTTPS and SSH access. Node is not required on the server. Choose a Hostinger web or cloud plan that includes these capabilities; confirm SSH in the selected plan before purchase. Hostinger documents its [file transfer and server access support](https://www.hostinger.com/support/which-file-transfer-and-server-access-options-are-supported-at-hostinger/) and [PHP extension support](https://www.hostinger.com/support/which-php-extensions-and-configuration-options-are-supported-at-hostinger/).

## Deployment layout

Unzip the package in the domain's directory, one level **above** `public_html`:

```text
your-domain/
  app/
    bootstrap.php
    seed-products.json
  scripts/
    create-admin.php
  config.example.php
  config.php             private; create on the server
  storage/               private; created by PHP
  public_html/
    index.html
    main.js, styles.css, ...
    assets/
    admin/
    api/index.php
    uploads/
```

Only `public_html` is public. Never put `app`, `config.php`, `storage`, database dumps or owner-creation scripts inside it. The API expects `app` two directories above `api/index.php`, so preserve this structure.

## Configure and launch

1. In hPanel, attach the domain, enable its SSL certificate, force HTTPS and choose PHP 8.2+. Enable `pdo_mysql`, `fileinfo`, `gd`, sessions and JSON. Set `upload_max_filesize` to at least `8M` and `post_max_size` to at least `10M`.
2. Create a new MySQL database and a user with access to that database. Keep the database name, host and credentials in the hosting account.
3. Upload/extract the deployment ZIP using the folder layout above. Rename the private `config.example.php` to `config.php` and fill in the database values. Keep `APP_ENV` set to `production` and `RAHMEEN_DB_DRIVER` set to `mysql`. Do not paste credentials into chat or commit the configured file.
4. Restrict `config.php` to the hosting account (typically mode `600`). The PHP process needs write access to private `storage/` and public `uploads/`; use the hosting account ownership and avoid world-writable permissions.
5. Open the store over HTTPS. The schema and sample catalogue initialize automatically on first API access. For an empty initial catalogue, replace `app/seed-products.json` with `[]` before the first request. Editing the seed file later does not overwrite existing products.
6. Through the hosting SSH terminal, from the domain directory, run `php scripts/create-admin.php`. Enter the owner's name, email and a password of at least 12 characters. The script is CLI-only; browser-based first-owner creation is disabled in production. Make sure the CLI PHP is also 8.2+ and has PDO MySQL.
7. Sign in at `https://your-domain/admin/`. Review settings and keep test mode on during acceptance testing. Replace/archive sample products, enter real inventory and media, and verify delivery charges and policies.
8. Place a test order, verify it appears in Orders, update its status, and confirm customer tracking. Check a fresh browser cannot read the admin API without signing in. Confirm `config.php` and `storage` are inaccessible by URL.
9. Supply real support/contact details and garment sizing before opening sales. Turn off test mode only when the catalogue and fulfilment process are ready. Cash on delivery is the only connected payment method.

## Existing local or live data

The ZIP contains application code and demo seeds only. It deliberately excludes local accounts, orders, uploaded product images and SQLite data. If real products are entered locally first, migrate those records and media to MySQL before launch; do not silently discard or reseed them. Take a backup before every migration or update.

For a later code update, preserve the live `config.php`, database, `storage` and `uploads`. Replacing the source files does not reset the database. Do not run a fresh installation over a live store without reviewing the migration.

## Backups and recovery

Use hosting backups for the MySQL database and `public_html/uploads` together; retain the private configuration securely. Test restoring a backup before accepting production orders. Order fulfilment and payment collection remain manual, and order changes do not send email or SMS. Review dashboard orders regularly. The current order list returns the most recent 1,000 orders; extend pagination before the store reaches that volume.

The local server is for development only. Do not run `npm run dev` or PHP's built-in server as the production service. Hostinger's configured PHP web server serves `public_html`.

## Verification still needed on Hostinger

Local tests cover SQLite, HTTP behaviour and an isolated MariaDB 10.4 instance using the MySQL driver. The actual hosting database connection, permissions, HTTPS cookie behaviour, upload limits and Apache/LiteSpeed configuration must still be verified during deployment. No Hostinger account has been connected or changed by this task.

