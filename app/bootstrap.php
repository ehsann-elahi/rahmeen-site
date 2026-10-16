<?php
declare(strict_types=1);

namespace Rahmeen;

const CATEGORIES = ['Ready to Wear', 'Unstitched', 'Festive'];
const ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

final class ApiException extends \RuntimeException {
    public function __construct(public int $status, string $message, public array $fields = []) { parent::__construct($message); }
}

function config(): array {
    static $config;
    if ($config !== null) return $config;
    $root = dirname(__DIR__);
    $file = is_file($root . '/config.php') ? require $root . '/config.php' : [];
    if (!is_array($file)) throw new \RuntimeException('Invalid private configuration.');
    $env = static function (string $name, mixed $fallback) use ($file): mixed {
        $value = getenv($name);
        return $value !== false && $value !== '' ? $value : ($file[$name] ?? $fallback);
    };
    $config = [
        'environment' => $env('APP_ENV', 'production'),
        'driver' => $env('RAHMEEN_DB_DRIVER', 'sqlite'),
        'storage' => rtrim((string) $env('RAHMEEN_STORAGE_DIR', $root . '/storage'), '/\\'),
        'mysqlHost' => $env('RAHMEEN_DB_HOST', '127.0.0.1'),
        'mysqlPort' => $env('RAHMEEN_DB_PORT', '3306'),
        'mysqlName' => $env('RAHMEEN_DB_NAME', ''),
        'mysqlUser' => $env('RAHMEEN_DB_USER', ''),
        'mysqlPassword' => $env('RAHMEEN_DB_PASSWORD', ''),
        'root' => $root,
    ];
    // The installed public directory is public_html on Hostinger; development
    // uses dist. The entry point supplies its real parent to avoid guessing.
    $public = realpath(defined('RAHMEEN_PUBLIC_ROOT') ? RAHMEEN_PUBLIC_ROOT : (is_dir($root . '/public_html') ? $root . '/public_html' : $root . '/dist'));
    if (!is_dir($config['storage']) && !mkdir($config['storage'], 0700, true) && !is_dir($config['storage'])) throw new \RuntimeException('Private storage is unavailable.');
    $storage = realpath($config['storage']);
    if (!$storage || ($public && (strcasecmp($storage, $public) === 0 || str_starts_with(strtolower(str_replace('\\', '/', $storage)) . '/', strtolower(str_replace('\\', '/', $public)) . '/')))) throw new \RuntimeException('Storage must be outside the document root.');
    return $config;
}

function jsonEncode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); }
function now(): string { return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z'); }
function nextProductVersion(string $previous): string {
    $current = now();
    // Wall clocks can repeat or move backwards. Every committed product/stock
    // write must still invalidate an editor that loaded the previous version.
    return strcmp($current, $previous) > 0 ? $current : (new \DateTimeImmutable($previous))->modify('+1 microsecond')->format('Y-m-d\TH:i:s.u\Z');
}
function touchProduct(\PDO $pdo, string $id): void {
    $stmt = $pdo->prepare('SELECT updated_at FROM products WHERE id = ?' . (config()['driver'] === 'mysql' ? ' FOR UPDATE' : '')); $stmt->execute([$id]);
    $previous = $stmt->fetchColumn();
    if ($previous !== false) $pdo->prepare('UPDATE products SET updated_at = ? WHERE id = ?')->execute([nextProductVersion($previous), $id]);
}
function fail(int $status, string $message, array $fields = []): never { throw new ApiException($status, $message, $fields); }

function db(): \PDO {
    static $pdo;
    if ($pdo) return $pdo;
    $config = config();
    if ($config['driver'] === 'mysql') {
        if (!$config['mysqlName'] || !$config['mysqlUser']) throw new \RuntimeException('MySQL credentials are missing.');
        $pdo = new \PDO('mysql:host=' . $config['mysqlHost'] . ';port=' . $config['mysqlPort'] . ';dbname=' . $config['mysqlName'] . ';charset=utf8mb4', $config['mysqlUser'], $config['mysqlPassword']);
    } elseif ($config['driver'] === 'sqlite') {
        $pdo = new \PDO('sqlite:' . $config['storage'] . '/rahmeen.sqlite');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 10000');
        $pdo->exec('PRAGMA journal_mode = WAL');
    } else throw new \RuntimeException('Unsupported database driver.');
    $pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);
    $pdo->setAttribute(\PDO::ATTR_EMULATE_PREPARES, false);
    initialize($pdo);
    return $pdo;
}

function initialize(\PDO $pdo): void {
    $suffix = config()['driver'] === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    $payloadType = config()['driver'] === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
    $schemas = [
        'meta' => '(meta_key VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL)',
        'admins' => '(id VARCHAR(40) PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, created_at VARCHAR(30) NOT NULL)',
        'products' => '(id VARCHAR(120) PRIMARY KEY, status VARCHAR(20) NOT NULL, payload ' . $payloadType . ' NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL)',
        'variants' => '(variant_key VARCHAR(64) PRIMARY KEY, product_id VARCHAR(120) NOT NULL, size_name VARCHAR(80) NOT NULL, color_name VARCHAR(80) NOT NULL, sku VARCHAR(100) NOT NULL, stock INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (product_id) REFERENCES products(id))',
        'orders' => '(id VARCHAR(40) PRIMARY KEY, number VARCHAR(40) UNIQUE NOT NULL, request_key VARCHAR(64) UNIQUE NOT NULL, status VARCHAR(20) NOT NULL, payment_status VARCHAR(20) NOT NULL, total_cents INTEGER NOT NULL, payload ' . $payloadType . ' NOT NULL, stock_released INTEGER NOT NULL DEFAULT 0, created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL)',
        'rate_limits' => '(bucket VARCHAR(64) PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
    ];
    foreach ($schemas as $table => $schema) $pdo->exec('CREATE TABLE IF NOT EXISTS ' . $table . ' ' . $schema . $suffix);
    // A database-level transaction makes concurrent first requests safe. The unique
    // meta key is the final guard if two MySQL workers initialize simultaneously.
    if (!$pdo->query("SELECT value FROM meta WHERE meta_key = 'initialized'")->fetchColumn()) {
        transaction($pdo, function () use ($pdo): void {
            $query = $pdo->query("SELECT value FROM meta WHERE meta_key = 'initialized'" . (config()['driver'] === 'mysql' ? ' FOR UPDATE' : ''));
            if ($query->fetchColumn()) return;
            $defaults = ['storeName' => 'RAHMEEN', 'announcement' => 'A wardrobe in bloom. Discover your next story.', 'shippingFee' => 250, 'codEnabled' => true, 'demoMode' => true, 'currency' => 'PKR'];
            $pdo->prepare('INSERT INTO meta (meta_key, value) VALUES (?, ?)')->execute(['settings', jsonEncode($defaults)]);
            $path = __DIR__ . '/seed-products.json';
            $seed = is_file($path) ? json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR) : [];
            if (isset($seed['products'])) $seed = $seed['products'];
            foreach ($seed as $index => $product) {
                $product['status'] = $product['status'] ?? 'active';
                $product['sku'] = $product['sku'] ?? strtoupper($product['id']);
                $product['featured'] = $product['featured'] ?? $index < 4;
                $product['compareAtPrice'] = $product['compareAtPrice'] ?? null;
                $product['images'] = $product['images'] ?? array_values(array_unique(array_filter([$product['image'] ?? '', $product['imageAlt'] ?? ''])));
                if (empty($product['variants'])) {
                    foreach ($product['sizes'] as $size) foreach ($product['colors'] as $color) {
                        $product['variants'][] = ['size' => $size, 'color' => $color['name'], 'sku' => $product['sku'] . '-' . strtoupper(preg_replace('/[^a-z0-9]+/i', '-', $size . '-' . $color['name'])), 'stock' => 10];
                    }
                }
                $product = validateProduct($product);
                saveProduct($pdo, $product, $index);
            }
            $pdo->prepare('INSERT INTO meta (meta_key, value) VALUES (?, ?)')->execute(['initialized', now()]);
        });
    }
}

function transaction(\PDO $pdo, callable $callback): mixed {
    $sqlite = config()['driver'] === 'sqlite';
    if ($sqlite) $pdo->exec('BEGIN IMMEDIATE'); else $pdo->beginTransaction();
    try {
        $result = $callback();
        if ($sqlite) $pdo->exec('COMMIT'); else $pdo->commit();
        return $result;
    } catch (\Throwable $error) {
        if ($sqlite) $pdo->exec('ROLLBACK'); elseif ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function settings(?\PDO $pdo = null): array {
    $pdo ??= db();
    return json_decode($pdo->query("SELECT value FROM meta WHERE meta_key = 'settings'")->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
}

function textField(mixed $value, string $field, int $max, bool $required = false): string {
    if (!is_string($value) && !is_numeric($value) && $value !== null) fail(400, 'Please check the highlighted fields.', [$field => 'Enter text.']);
    $value = trim((string) ($value ?? ''));
    if (($required && $value === '') || strlen($value) > $max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) fail(400, 'Please check the highlighted fields.', [$field => $required && $value === '' ? 'This field is required.' : 'This text is too long or contains invalid characters.']);
    return $value;
}

function passwordField(mixed $value): string {
    if (!is_string($value) || $value === '' || strlen($value) > 200) fail(400, 'Enter a valid password.', ['password' => 'Enter a password up to 200 characters.']);
    return $value;
}

function numberField(mixed $value, string $field, float $min = 0, float $max = 10000000): float {
    if (!is_numeric($value) || is_bool($value) || !is_finite((float) $value) || (float) $value < $min || (float) $value > $max) fail(400, 'Please check the highlighted fields.', [$field => "Enter a number between $min and $max."]);
    return round((float) $value, 2);
}

function listField(mixed $value, string $field, int $max = 30): array {
    if (!is_array($value) || !array_is_list($value) || count($value) > $max) fail(400, 'Please check the highlighted fields.', [$field => 'Enter a valid list.']);
    return $value;
}

function imageUrl(mixed $value, string $field): string {
    $url = textField($value, $field, 1500);
    if ($url === '') return '';
    if (preg_match('~^(?:\./|/)?(?:assets|uploads)/[A-Za-z0-9/_ .-]+\.(?:webp|jpe?g|png)$~i', $url) && !str_contains($url, '..')) return $url;
    // Only HTTPS images; protocols and executable relative URLs never enter HTML.
    if (filter_var($url, FILTER_VALIDATE_URL) && parse_url($url, PHP_URL_SCHEME) === 'https' && !parse_url($url, PHP_URL_USER)) return $url;
    fail(400, 'Please check the image address.', [$field => 'Use an uploaded image, an assets path, or an HTTPS image URL.']);
}

function validateProduct(array $input, ?string $existingId = null): array {
    $id = $existingId ?? textField($input['id'] ?? '', 'id', 120);
    if ($id === '') {
        $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', (string) ($input['name'] ?? 'product')), '-'));
        $id = substr($slug ?: 'product', 0, 95) . '-' . bin2hex(random_bytes(4));
    }
    if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,119}$/', $id)) fail(400, 'Use a valid product identifier.', ['id' => 'Use lowercase letters, numbers, hyphens or underscores.']);
    $category = $input['category'] ?? '';
    if (!in_array($category, CATEGORIES, true)) fail(400, 'Choose one of the three store categories.', ['category' => 'The store categories cannot be changed.']);
    $status = $input['status'] ?? 'draft';
    if (!in_array($status, ['active', 'draft', 'archived'], true)) fail(400, 'Choose a valid product status.', ['status' => 'Use active, draft or archived.']);
    $product = [
        'id' => $id, 'name' => textField($input['name'] ?? '', 'name', 160, true),
        'category' => $category, 'subtitle' => textField($input['subtitle'] ?? '', 'subtitle', 200),
        'price' => numberField($input['price'] ?? null, 'price', 1),
        'fabric' => textField($input['fabric'] ?? '', 'fabric', 100),
        'image' => imageUrl($input['image'] ?? '', 'image'),
        'imageAlt' => imageUrl($input['imageAlt'] ?? '', 'imageAlt'),
        'position' => textField($input['position'] ?? '50% 50%', 'position', 40),
        'description' => textField($input['description'] ?? '', 'description', 8000),
        'care' => textField($input['care'] ?? '', 'care', 2500),
        'sku' => textField($input['sku'] ?? strtoupper($id), 'sku', 100, true),
        'status' => $status, 'featured' => (bool) ($input['featured'] ?? false),
        'compareAtPrice' => isset($input['compareAtPrice']) && $input['compareAtPrice'] !== '' ? numberField($input['compareAtPrice'], 'compareAtPrice', 1) : null,
    ];
    if (!preg_match('/^(?:\d{1,3}%|center|top|bottom|left|right)(?:\s+(?:\d{1,3}%|center|top|bottom|left|right))?$/', $product['position'])) fail(400, 'Use a valid image position.', ['position' => 'For example: 50% 50%.']);
    if ($product['compareAtPrice'] !== null && $product['compareAtPrice'] < $product['price']) fail(400, 'Compare-at price must be at least the selling price.', ['compareAtPrice' => 'Enter a price at least as high as the selling price.']);
    $product['details'] = array_map(fn($v) => textField($v, 'details', 500), listField($input['details'] ?? [], 'details', 20));
    $product['images'] = array_values(array_unique(array_filter(array_map(fn($v) => imageUrl($v, 'images'), listField($input['images'] ?? [], 'images', 12)))));
    if (!$product['image'] && $product['images']) $product['image'] = $product['images'][0];
    if ($product['image'] && !in_array($product['image'], $product['images'], true)) array_unshift($product['images'], $product['image']);
    if ($status === 'active' && !$product['image']) fail(400, 'An active product needs a main image.', ['image' => 'Add a product image before publishing.']);
    $product['sizes'] = array_values(array_unique(array_map(fn($v) => textField($v, 'sizes', 80, true), listField($input['sizes'] ?? [], 'sizes', 20))));
    $colors = listField($input['colors'] ?? [], 'colors', 20);
    $product['colors'] = [];
    foreach ($colors as $color) {
        if (!is_array($color)) fail(400, 'Enter valid product colours.', ['colors' => 'Each colour needs a name and hex value.']);
        $name = textField($color['name'] ?? '', 'colors', 80, true);
        $hex = textField($color['hex'] ?? '', 'colors', 7, true);
        if (!preg_match('/^#[0-9a-f]{6}$/i', $hex) || in_array($name, array_column($product['colors'], 'name'), true)) fail(400, 'Enter unique colours and valid hex codes.', ['colors' => 'For example: Ivory, #e8dfcc.']);
        $product['colors'][] = ['name' => $name, 'hex' => $hex];
    }
    if (!$product['sizes'] || !$product['colors']) fail(400, 'Add at least one size and colour.', ['sizes' => 'Use One Size or Unstitched where appropriate.', 'colors' => 'Add at least one colour.']);
    if (count($product['sizes']) * count($product['colors']) > 200) fail(400, 'A product can have at most 200 variants.');
    $variants = listField($input['variants'] ?? [], 'variants', 200);
    $product['variants'] = []; $seen = [];
    foreach ($variants as $variant) {
        if (!is_array($variant)) fail(400, 'Enter valid inventory variants.');
        $size = textField($variant['size'] ?? '', 'variants', 80, true);
        $color = textField($variant['color'] ?? '', 'variants', 80, true);
        $key = variantKey($id, $size, $color);
        $stock = $variant['stock'] ?? null;
        if (!in_array($size, $product['sizes'], true) || !in_array($color, array_column($product['colors'], 'name'), true) || isset($seen[$key])) fail(400, 'Each size and colour combination must be unique and match the product.', ['variants' => 'Rebuild the inventory variants from the chosen sizes and colours.']);
        if (filter_var($stock, FILTER_VALIDATE_INT) === false || (int) $stock < 0 || (int) $stock > 1000000) fail(400, 'Stock must be a whole number between 0 and 1,000,000.', ['variants' => 'Check variant inventory.']);
        $product['variants'][] = ['size' => $size, 'color' => $color, 'sku' => textField($variant['sku'] ?? $product['sku'], 'variants', 100, true), 'stock' => (int) $stock];
        $seen[$key] = true;
    }
    if (count($variants) !== count($product['sizes']) * count($product['colors'])) fail(400, 'Enter stock for every size and colour combination.', ['variants' => 'Every variant needs a stock quantity, including zero.']);
    return $product;
}

function variantKey(string $id, string $size, string $color): string { return hash('sha256', $id . "\0" . $size . "\0" . $color); }

function saveProduct(\PDO $pdo, array $product, ?int $sortOrder = null): void {
    $exists = $pdo->prepare('SELECT updated_at FROM products WHERE id = ?' . (config()['driver'] === 'mysql' ? ' FOR UPDATE' : '')); $exists->execute([$product['id']]);
    $previous = $exists->fetchColumn();
    $variants = $product['variants']; unset($product['variants']);
    if ($previous !== false) {
        $pdo->prepare('UPDATE products SET status = ?, payload = ?, updated_at = ? WHERE id = ?')->execute([$product['status'], jsonEncode($product), nextProductVersion($previous), $product['id']]);
    } else {
        $pdo->prepare('INSERT INTO products (id, status, payload, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')->execute([$product['id'], $product['status'], jsonEncode($product), $sortOrder ?? 1000, now(), now()]);
    }
    $pdo->prepare('DELETE FROM variants WHERE product_id = ?')->execute([$product['id']]);
    $insert = $pdo->prepare('INSERT INTO variants (variant_key, product_id, size_name, color_name, sku, stock) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($variants as $variant) $insert->execute([variantKey($product['id'], $variant['size'], $variant['color']), $product['id'], $variant['size'], $variant['color'], $variant['sku'], $variant['stock']]);
}

function getProducts(bool $activeOnly = false, ?string $id = null, ?\PDO $pdo = null): array {
    $pdo ??= db();
    $query = 'SELECT * FROM products WHERE 1 = 1'; $params = [];
    if ($activeOnly) $query .= " AND status = 'active'";
    if ($id !== null) { $query .= ' AND id = ?'; $params[] = $id; }
    $query .= ' ORDER BY sort_order, created_at DESC, id';
    $stmt = $pdo->prepare($query); $stmt->execute($params);
    $products = $stmt->fetchAll();
    $variantStmt = $pdo->prepare('SELECT size_name, color_name, sku, stock FROM variants WHERE product_id = ?');
    return array_map(function ($row) use ($variantStmt): array {
        $product = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
        $product['status'] = $row['status'];
        $product['createdAt'] = $row['created_at']; $product['updatedAt'] = $row['updated_at'];
        $variantStmt->execute([$product['id']]);
        // A removed historical variant may be restocked after cancellation. Only
        // currently offered size/colour combinations appear in the catalogue.
        $product['variants'] = array_values(array_map(fn($v) => ['size' => $v['size_name'], 'color' => $v['color_name'], 'sku' => $v['sku'], 'stock' => (int) $v['stock']], array_filter($variantStmt->fetchAll(), fn($v) => in_array($v['size_name'], $product['sizes'], true) && in_array($v['color_name'], array_column($product['colors'], 'name'), true))));
        return $product;
    }, $products);
}

function decodeOrder(array $row): array {
    $order = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
    $order['status'] = $row['status']; $order['paymentStatus'] = $row['payment_status'];
    $order['createdAt'] = $row['created_at']; $order['updatedAt'] = $row['updated_at'];
    return $order;
}

function getOrder(string $id, ?\PDO $pdo = null, bool $lock = false): array {
    $pdo ??= db();
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?' . ($lock && config()['driver'] === 'mysql' ? ' FOR UPDATE' : '')); $stmt->execute([$id]);
    $row = $stmt->fetch(); if (!$row) fail(404, 'Order not found.');
    return $row;
}

function validateCustomer(mixed $input): array {
    if (!is_array($input)) fail(400, 'Please enter your delivery details.');
    $customer = [];
    foreach (['name' => 120, 'email' => 190, 'phone' => 30, 'address' => 500, 'city' => 100, 'province' => 100, 'postalCode' => 20, 'notes' => 1200] as $field => $max) $customer[$field] = textField($input[$field] ?? '', 'customer.' . $field, $max, in_array($field, ['name', 'phone', 'address', 'city', 'province'], true));
    if ($customer['email'] && !filter_var($customer['email'], FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid email address.', ['customer.email' => 'Check your email address.']);
    $digits = preg_replace('/\D/', '', $customer['phone']);
    if (strlen($digits) < 10 || strlen($digits) > 15 || !preg_match('/^[0-9+() .-]+$/', $customer['phone'])) fail(400, 'Enter a valid contact number.', ['customer.phone' => 'Use a phone number with 10 to 15 digits.']);
    if (strlen($customer['address']) < 8) fail(400, 'Enter your complete delivery address.', ['customer.address' => 'Include your house, street and area.']);
    return $customer;
}

function placeOrder(array $input, string $sessionScope, ?\PDO $pdo = null, bool $quote = false): array {
    $pdo ??= db();
    $requestId = $quote ? bin2hex(random_bytes(16)) : textField($input['requestId'] ?? '', 'requestId', 100, true);
    if (!preg_match('/^[a-zA-Z0-9_-]{16,100}$/', $requestId)) fail(400, 'Refresh checkout and try again.', ['requestId' => 'A valid checkout request identifier is required.']);
    $requestKey = hash_hmac('sha256', $requestId, $sessionScope);
    return transaction($pdo, function () use ($pdo, $input, $requestKey, $quote): array {
        $existing = $pdo->prepare('SELECT * FROM orders WHERE request_key = ?'); $existing->execute([$requestKey]);
        if ($row = $existing->fetch()) return publicOrder(decodeOrder($row));
        $settings = settings($pdo);
        if (($input['paymentMethod'] ?? '') !== 'cod' || !$settings['codEnabled']) fail(400, 'Cash on delivery is not available for this order.');
        $customer = $quote ? [] : validateCustomer($input['customer'] ?? null);
        $requestedItems = listField($input['items'] ?? [], 'items', 50);
        if (!$requestedItems) fail(400, 'Your bag is empty.');
        $aggregated = [];
        foreach ($requestedItems as $item) {
            if (!is_array($item)) fail(400, 'Invalid bag item.');
            $id = textField($item['id'] ?? '', 'items', 120, true);
            $size = textField($item['size'] ?? '', 'items', 80, true);
            $color = textField($item['color'] ?? '', 'items', 80, true);
            $quantity = $item['quantity'] ?? null;
            if (filter_var($quantity, FILTER_VALIDATE_INT) === false || (int) $quantity < 1 || (int) $quantity > 20) fail(400, 'Choose between 1 and 20 of each item.', ['items' => 'Invalid quantity.']);
            $key = variantKey($id, $size, $color);
            if (!isset($aggregated[$key])) $aggregated[$key] = ['id' => $id, 'size' => $size, 'color' => $color, 'quantity' => 0];
            $aggregated[$key]['quantity'] += (int) $quantity;
            if ($aggregated[$key]['quantity'] > 20) fail(400, 'Choose no more than 20 of each variant.');
        }
        uasort($aggregated, fn($a, $b) => [$a['id'], $a['size'], $a['color']] <=> [$b['id'], $b['size'], $b['color']]); // Consistent product lock order.
        $items = []; $subtotalCents = 0;
        foreach ($aggregated as $key => $item) {
            $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?' . (config()['driver'] === 'mysql' ? ' FOR UPDATE' : '')); $stmt->execute([$item['id']]);
            $row = $stmt->fetch();
            if (!$row || $row['status'] !== 'active') fail(409, 'An item in your bag is no longer available.', ['items' => 'Remove unavailable items and try again.']);
            $product = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
            if (!in_array($item['size'], $product['sizes'], true) || !in_array($item['color'], array_column($product['colors'], 'name'), true)) fail(409, 'A selected size or colour is no longer offered.', ['items' => 'Choose an available product variant.']);
            $variantStmt = $pdo->prepare('SELECT * FROM variants WHERE variant_key = ?'); $variantStmt->execute([$key]); $variant = $variantStmt->fetch();
            if (!$variant) fail(409, 'A selected product variant is unavailable.');
            if ($quote) $available = (int) $variant['stock'] >= $item['quantity'];
            else {
                $reserve = $pdo->prepare('UPDATE variants SET stock = stock - ? WHERE variant_key = ? AND stock >= ?');
                $reserve->execute([$item['quantity'], $key, $item['quantity']]);
                $available = $reserve->rowCount() === 1;
            }
            if (!$available) fail(409, $product['name'] . ' does not have enough stock in ' . $item['size'] . ' / ' . $item['color'] . '.', ['items' => 'Reduce the quantity or select another variant.']);
            if (!$quote) touchProduct($pdo, $item['id']);
            $priceCents = (int) round((float) $product['price'] * 100);
            $lineCents = $priceCents * $item['quantity']; $subtotalCents += $lineCents;
            $items[] = array_merge($item, ['name' => $product['name'], 'image' => $product['image'], 'sku' => $variant['sku'], 'price' => $priceCents / 100, 'lineTotal' => $lineCents / 100]);
        }
        $shippingCents = (int) round((float) $settings['shippingFee'] * 100);
        if ($subtotalCents + $shippingCents > 2000000000) fail(400, 'This order exceeds the online order limit.');
        if ($quote) return ['items' => $items, 'subtotal' => $subtotalCents / 100, 'shippingFee' => $shippingCents / 100, 'total' => ($subtotalCents + $shippingCents) / 100, 'demoMode' => (bool) $settings['demoMode']];
        if (array_key_exists('expectedTotal', $input) && (int) round(numberField($input['expectedTotal'], 'expectedTotal', 0, 20000000) * 100) !== $subtotalCents + $shippingCents) fail(409, 'The price or delivery charge changed. Review the updated total before placing your order.', ['total' => 'Refresh your order total and try again.']);
        if (array_key_exists('expectedDemoMode', $input) && (!is_bool($input['expectedDemoMode']) || $input['expectedDemoMode'] !== (bool) $settings['demoMode'])) fail(409, 'The store order mode changed. Review checkout before placing your order.', ['demoMode' => 'Refresh checkout to review whether this is a test or real order.']);
        $id = bin2hex(random_bytes(16));
        $number = 'RA-' . gmdate('ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
        $order = ['id' => $id, 'number' => $number, 'status' => 'pending', 'paymentStatus' => 'unpaid', 'customer' => $customer, 'items' => $items, 'subtotal' => $subtotalCents / 100, 'shippingFee' => $shippingCents / 100, 'total' => ($subtotalCents + $shippingCents) / 100, 'paymentMethod' => 'cod', 'demoMode' => (bool) $settings['demoMode'], 'notes' => '', 'trackingNumber' => '', 'createdAt' => now(), 'updatedAt' => now()];
        $pdo->prepare('INSERT INTO orders (id, number, request_key, status, payment_status, total_cents, payload, stock_released, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$id, $number, $requestKey, 'pending', 'unpaid', $subtotalCents + $shippingCents, jsonEncode($order), 0, $order['createdAt'], $order['updatedAt']]);
        return publicOrder($order);
    });
}

function publicOrder(array $order): array {
    return array_intersect_key($order, array_flip(['id', 'number', 'status', 'paymentStatus', 'total', 'subtotal', 'shippingFee', 'demoMode', 'items', 'paymentMethod', 'createdAt']));
}

function updateOrder(string $id, array $input, ?\PDO $pdo = null): array {
    $pdo ??= db();
    return transaction($pdo, function () use ($pdo, $id, $input): array {
        $row = getOrder($id, $pdo, true); $order = decodeOrder($row);
        $status = $input['status'] ?? $order['status'];
        $payment = $input['paymentStatus'] ?? $order['paymentStatus'];
        if (!in_array($status, ORDER_STATUSES, true) || !in_array($payment, PAYMENT_STATUSES, true)) fail(400, 'Choose a valid order and payment status.');
        if ($order['status'] === 'cancelled' && $status !== 'cancelled') fail(409, 'A cancelled order cannot be reopened. Create a new order instead.');
        if ($order['status'] === 'delivered' && $status !== 'delivered') fail(409, 'A delivered order cannot return to an earlier status.');
        if ($status === 'cancelled' && (int) $row['stock_released'] === 0) {
            // Match checkout/admin lock order (products, then variants) to avoid
            // a MySQL cancellation competing with a new order deadlocking.
            $productIds = array_values(array_unique(array_column($order['items'], 'id'))); sort($productIds);
            if (config()['driver'] === 'mysql') foreach ($productIds as $productId) {
                $lock = $pdo->prepare('SELECT id FROM products WHERE id = ? FOR UPDATE'); $lock->execute([$productId]); $lock->fetchColumn();
            }
            foreach ($order['items'] as $item) {
                $key = variantKey($item['id'], $item['size'], $item['color']);
                $stmt = $pdo->prepare('SELECT variant_key FROM variants WHERE variant_key = ?'); $stmt->execute([$key]);
                if ($stmt->fetchColumn()) $pdo->prepare('UPDATE variants SET stock = stock + ? WHERE variant_key = ?')->execute([$item['quantity'], $key]);
                else $pdo->prepare('INSERT INTO variants (variant_key, product_id, size_name, color_name, sku, stock) VALUES (?, ?, ?, ?, ?, ?)')->execute([$key, $item['id'], $item['size'], $item['color'], $item['sku'], $item['quantity']]);
                touchProduct($pdo, $item['id']);
            }
        }
        $order['status'] = $status; $order['paymentStatus'] = $payment;
        $order['notes'] = textField($input['notes'] ?? $order['notes'], 'notes', 8000);
        $order['trackingNumber'] = textField($input['trackingNumber'] ?? $order['trackingNumber'], 'trackingNumber', 150);
        $order['updatedAt'] = now();
        $pdo->prepare('UPDATE orders SET status = ?, payment_status = ?, payload = ?, stock_released = ?, updated_at = ? WHERE id = ?')->execute([$status, $payment, jsonEncode($order), $status === 'cancelled' ? 1 : (int) $row['stock_released'], $order['updatedAt'], $id]);
        return $order;
    });
}

function createAdmin(string $name, string $email, string $password, ?\PDO $pdo = null): array {
    $pdo ??= db(); $name = textField($name, 'name', 120, true); $email = strtolower(textField($email, 'email', 190, true));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid admin email.', ['email' => 'A valid email is required.']);
    if (strlen($password) < 12 || strlen($password) > 200) fail(400, 'Use a password with 12 to 200 characters.', ['password' => 'At least 12 characters are required.']);
    $admin = ['id' => bin2hex(random_bytes(16)), 'name' => $name, 'email' => $email];
    $pdo->prepare('INSERT INTO admins (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$admin['id'], $name, $email, password_hash($password, PASSWORD_DEFAULT), now()]);
    return $admin;
}

function rateLimit(string $name, string $identity, int $limit, int $window): void {
    $pdo = db(); $bucket = hash('sha256', $name . ':' . $identity); $time = time();
    transaction($pdo, function () use ($pdo, $bucket, $time, $limit, $window): void {
        $stmt = $pdo->prepare('SELECT attempts, expires_at FROM rate_limits WHERE bucket = ?' . (config()['driver'] === 'mysql' ? ' FOR UPDATE' : '')); $stmt->execute([$bucket]); $row = $stmt->fetch();
        if ($row && (int) $row['expires_at'] > $time && (int) $row['attempts'] >= $limit) fail(429, 'Too many attempts. Please try again later.');
        if ($row && (int) $row['expires_at'] > $time) $pdo->prepare('UPDATE rate_limits SET attempts = attempts + 1 WHERE bucket = ?')->execute([$bucket]);
        elseif ($row) $pdo->prepare('UPDATE rate_limits SET attempts = 1, expires_at = ? WHERE bucket = ?')->execute([$time + $window, $bucket]);
        else $pdo->prepare('INSERT INTO rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?)')->execute([$bucket, $time + $window]);
        $pdo->prepare('DELETE FROM rate_limits WHERE expires_at < ?')->execute([$time - 86400]);
    });
}

function updateSettings(array $input): array {
    $current = settings();
    foreach (['codEnabled', 'demoMode'] as $key) {
        if (array_key_exists($key, $input)) {
            if (!is_bool($input[$key])) fail(400, 'Enter valid store settings.', [$key => 'Use true or false.']);
            $current[$key] = $input[$key];
        }
    }
    if (isset($input['storeName'])) $current['storeName'] = textField($input['storeName'], 'storeName', 100, true);
    if (isset($input['announcement'])) $current['announcement'] = textField($input['announcement'], 'announcement', 240);
    if (isset($input['shippingFee'])) $current['shippingFee'] = numberField($input['shippingFee'], 'shippingFee', 0, 100000);
    $current['currency'] = 'PKR';
    db()->prepare("UPDATE meta SET value = ? WHERE meta_key = 'settings'")->execute([jsonEncode($current)]);
    return $current;
}
