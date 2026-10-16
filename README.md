# RAHMEEN — storefront and store management

A responsive fashion storefront with a PHP API and a private product/order dashboard. The desktop header follows the slim announcement bar, centered collection links and icon actions requested from the Khaadi reference. The existing mobile navigation and three categories are retained.

## Run locally

Requires PHP 8.2+ with PDO SQLite, fileinfo, GD and sessions. Node is used only for the convenient launcher; there are no npm dependencies and no build step.

```powershell
cd D:\RahmeenArts\rahmeen-site
npm run dev
```

Open `http://127.0.0.1:4173/` for the store and `http://127.0.0.1:4173/admin/` for management. On this computer the launcher detects `C:\xamp 8\php\php.exe`; elsewhere set `PHP_BINARY` if PHP is not on PATH. Set `PORT` to use a different port. Stop with Ctrl+C.

On the first local admin visit, create your owner account. There is no default admin password. Product and order data is saved in `storage/rahmeen.sqlite`, outside the public directory. The local setup screen is limited to loopback and only appears when no administrator exists.

## Manage the store

- **Overview:** order totals, paid revenue, orders needing attention, collection counts and low-stock variants.
- **Products:** browse Ready to Wear, Unstitched or Festive; search and filter by status; create, edit, publish, draft or archive products. Category names stay fixed.
- **Product editor:** name, subtitle, description, fabric, care, detail lines, selling/compare-at price, SKU, featured flag, media gallery, sizes, colour names/swatches and stock/SKU for every size-colour variant. Upload JPEG, PNG or WebP images and arrange the gallery.
- **Orders:** customer delivery details, ordered variants, totals, payment status, fulfilment status, courier reference and private notes. Cancelling restores stock once; cancelled orders cannot be reopened.
- **Store settings:** announcement text, delivery charge, cash on delivery, delivery/returns notes and test mode.

The storefront reads published products from the database. Checkout verifies prices and inventory on the server, reserves stock and saves an order number. Repeated submission of the same checkout request does not create duplicate orders. Customers can track an order using its number and matching phone number. Cart and wishlist stay in the customer's browser; the product catalogue and orders are server data.

## Demo content and launch

Test mode is on initially. Test orders are labelled and must not be fulfilled. Nine sample products and generated concept photographs are included. Replace or archive the samples, supply actual stock, garment measurements, contact information and approved policies before enabling real orders. The original supplied logo is preserved unchanged.

Cash on delivery is implemented. Online payment collection, automated email/SMS, shipping-provider integration and newsletter subscriptions are not connected. Admin order updates do not send customer messages. All administrators have full store access; staff roles and self-service password resets are outside this version.

## Hostinger

Use PHP/MySQL hosting with SSH access. See [HOSTINGER.md](HOSTINGER.md) for the folder layout, database setup, owner creation, backups and launch procedure. This update is local; the previously published `chatgpt.site` preview remains the older static version and cannot execute this PHP backend.

Create a fresh deployment ZIP with:

```powershell
python prepare-hostinger.py
```

The ZIP excludes credentials, databases, test data, sessions and uploaded images. It starts a fresh store with the sample catalogue. Local database changes and real uploads require a separate migration; do not replace an existing live database with the demo seeds.

## Checks

```powershell
npm run check
& 'C:\xamp 8\php\php.exe' tests/backend.php
& 'C:\xamp 8\php\php.exe' tests/backend-http.php
```

The PHP tests use isolated temporary data. Read [VERIFICATION.md](VERIFICATION.md) for the completed checks and remaining deployment verification.

## Code map

`dist/` is the public web directory; `dist/admin/` is the management UI; `dist/api/index.php` is the JSON endpoint. `app/bootstrap.php` owns validation and persistence. `app/seed-products.json` initializes a new database once. `config.php` (untracked, private) configures production. `router.php` and `server.mjs` are local development helpers only.

Reference: [Khaadi Pakistan](https://pk.khaadi.com/). Only desktop header structure informed this update; RAHMEEN's branding, content and imagery remain its own.
