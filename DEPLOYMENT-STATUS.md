# Hostinger deployment status — 2026-10-16

Domain: rahmeenarts.store. Existing WordPress site remains live.

Completed on Hostinger:
- Confirmed active Business Web Hosting, PHP 8.3 and HTTPS.
- Requested manual files/database backup; hPanel displayed In progress. Completion still needs verification.
- Uploaded release/rahmeen-hostinger-20261014-221938.zip above public_html through the domain file manager.
- Extracted into private folder rahmeen-release-20261016 and verified app/, public_html/, scripts/ and config.example.php.

Pending:
- SSH is INACTIVE. Obtain action-time approval to enable it and register a temporary deployment SSH key. Remove that key and restore disabled SSH after deployment.
- Verify backup completion before replacing WordPress.
- Create a separate production MySQL database and private configuration; preserve the WordPress database.
- Configure the staged application, create dashboard owner securely, and replace public_html with the prepared store while retaining a private rollback copy.
- Verify storefront, API, admin authentication, uploads, test order and tracking over HTTPS. Keep demo mode enabled until sales readiness review.

No WordPress files or database were removed, and the new store is not yet live.
