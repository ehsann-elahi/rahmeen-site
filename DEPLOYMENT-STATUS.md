# Hostinger deployment status — 2026-10-17

Live store: https://rahmeenarts.store/
Repository: https://github.com/ehsann-elahi/rahmeen-site
Deployed application commit: 9fb000e1eecbafea3ddc642e62f8093255ae09b7.

Completed on Hostinger:
- Confirmed active Business Web Hosting, PHP 8.3 and HTTPS.
- Pushed the application source to the repository's main branch.
- Created a separate MySQL database and private config.php outside public_html (mode 600).
- Verified all 27 deployed application files against the local source using SHA-256.
- Activated the new public_html; retained the previous WordPress files privately in wordpress-rollback-20261016 and left its database intact.
- Requested a Hostinger backup before deployment; completion was not confirmed. The retained WordPress files and untouched database provide the immediate rollback path.
- Verified the live storefront, product selection, shopping bag, checkout and customer tracking.
- Placed test order RA-261016-FBBC91D2, confirmed it was saved and trackable, then cancelled it through the application backend to restore stock.
- Verified anonymous admin orders return 401. Private configuration, app, storage, CLI scripts and rollback files return 404 through public URLs.
- Verified HTTP redirects to HTTPS and session cookies use Secure, HttpOnly and SameSite=Lax.
- Purged the Hostinger server/CDN cache after activation.

Pending:
- The user deferred owner-account creation. There are no admin accounts; create the owner over SSH with scripts/create-admin.php when requested.
- Authenticated admin and image-upload acceptance tests on Hostinger require that owner account.
- Replace sample products and verify inventory, contact details, delivery policies and charges before enabling real orders. Demo mode remains on.
- Verify hosting backup completion and recovery procedures.
- Deployment is manual over SSH; pushing to GitHub does not automatically deploy.

SSH was configured by the user with their Website-Deploy key and remains enabled. No temporary agent key was added. No WordPress files or database were deleted.
