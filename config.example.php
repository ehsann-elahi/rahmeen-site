<?php
// Copy to config.php beside app/, outside public_html (the document root).
// Environment variables of the same names take precedence. Never commit config.php.
return [
    'APP_ENV' => 'production',
    'RAHMEEN_DB_DRIVER' => 'mysql',
    'RAHMEEN_DB_HOST' => 'localhost',
    'RAHMEEN_DB_PORT' => '3306',
    'RAHMEEN_DB_NAME' => 'your_database',
    'RAHMEEN_DB_USER' => 'your_database_user',
    'RAHMEEN_DB_PASSWORD' => 'your_database_password',
    // Keep storage outside the public document root. Local development defaults
    // to <project>/storage with SQLite when RAHMEEN_DB_DRIVER is omitted.
    // 'RAHMEEN_STORAGE_DIR' => '/home/your-user/domains/your-domain/storage',
];
