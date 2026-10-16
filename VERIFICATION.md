# Verification

Completed 15 October 2026. All test accounts, orders and product edits were confined to isolated QA storage; the delivery package contains no runtime data or credentials.

## Automated

- All JavaScript modules pass `npm run check`.
- Frontend regression checks pass: CSRF refresh, pending receipt persistence without customer data, stable retry identity, expired-session guard, successful receipt cleanup, gallery and sale price rendering.
- PHP core suite: 44 assertions pass for catalogue validation, server prices, stock reservation/rollback, duplicate request handling, cancellation, immutable categories, archived products, password hashes, rate limits and monotonic inventory revisions.
- Real HTTP suite: 37 assertions pass for authentication, CSRF/origin controls, isolated sessions, checkout scope, checkout/quote/tracking, product CRUD and protected file paths. Upload checks include rejecting invalid media and re-encoding valid images with appended executable content.
- Isolated MariaDB 10.4: 7 assertions pass, including schema initialization, transactional ordering and order snapshots exceeding 64 KB. The temporary server was stopped and removed after testing. The user's installed database data was not used.

## Browser checks

- Desktop announcement strip, centered category navigation, original logo and search/wishlist/bag icons inspected.
- Product navigation, size selection, bag, current delivery charge and cash-on-delivery checkout verified.
- Test order placed successfully, retrieved through customer tracking, and displayed in admin Orders.
- Admin sign-in, expiry handling, product search/edit/save, image upload, and fulfilment-status/private-note save verified.
- Mobile storefronts inspected in 390 px and 320 px embedded browser viewports after the browser resize control failed to apply. Both page widths and checkout dialogs had no horizontal overflow. Existing mobile logo and bottom navigation retained.
- Storefront and admin browser error logs were empty during final checks.

## Deployment boundary

This is a locally verified PHP/MySQL-capable application, not a connected Hostinger deployment. Verify the actual hosting account's HTTPS, PHP extensions, MySQL credentials, permissions, upload limits and web-server rules during deployment.

Nine sample products and generated conceptual photographs remain. Demo mode is enabled by default. Online payments, email/SMS, courier integration and newsletter subscriptions are not connected. Product/order management is persistent; local browser storage is used only for cart/wishlist, with a non-PII interrupted-checkout receipt in session storage.
