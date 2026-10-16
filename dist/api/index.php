<?php
declare(strict_types=1);

use function Rahmeen\{config, db, fail, jsonEncode, settings, getProducts, validateProduct, saveProduct, transaction, now, createAdmin, textField, passwordField, rateLimit, placeOrder, updateOrder, decodeOrder, getOrder, updateSettings};
use Rahmeen\ApiException;

define('RAHMEEN_PUBLIC_ROOT', dirname(__DIR__));
require dirname(__DIR__, 2) . '/app/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');

function response(array $data, int $status = 200): never {
    http_response_code($status);
    echo jsonEncode($data);
    exit;
}

function requestBody(): array {
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2097152) fail(413, 'This request is too large.');
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) fail(415, 'Send JSON with application/json content type.');
    $raw = file_get_contents('php://input', false, null, 0, 2097153);
    if (strlen($raw) > 2097152) fail(413, 'This request is too large.');
    try { $body = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException) { fail(400, 'The request contains invalid JSON.'); }
    if (!is_array($body) || array_is_list($body) && count($body) > 0) fail(400, 'Send a JSON object.');
    return $body;
}

function isHttps(): bool { return isset($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off' && $_SERVER['HTTPS'] !== ''; }
function isLocalRequest(): bool { return config()['environment'] === 'local' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true); }
function adminSession(): ?array {
    if (!isset($_SESSION['adminId'])) return null;
    if (time() - ($_SESSION['adminLastActive'] ?? 0) > 7200) { unset($_SESSION['adminId'], $_SESSION['adminLastActive']); return null; }
    $stmt = db()->prepare('SELECT id, name, email FROM admins WHERE id = ?'); $stmt->execute([$_SESSION['adminId']]);
    $admin = $stmt->fetch();
    if (!$admin) { unset($_SESSION['adminId']); return null; }
    $_SESSION['adminLastActive'] = time();
    return ['email' => $admin['email'], 'name' => $admin['name']];
}

function authenticate(array $admin): void {
    session_regenerate_id(true);
    $_SESSION['adminId'] = $admin['id']; $_SESSION['adminLastActive'] = time();
    // The caller's per-session CSRF token remains valid after the session ID rotates.
}

function trackingPhone(string $phone): string {
    $phone = preg_replace('/\D/', '', $phone);
    if (str_starts_with($phone, '0092')) $phone = substr($phone, 2);
    if (strlen($phone) === 11 && str_starts_with($phone, '03')) $phone = '92' . substr($phone, 1);
    return $phone;
}

try {
    $config = config();
    $sessionPath = $config['storage'] . '/sessions';
    if (!is_dir($sessionPath) && !mkdir($sessionPath, 0700, true) && !is_dir($sessionPath)) throw new RuntimeException('Session storage is unavailable.');
    ini_set('session.use_strict_mode', '1'); ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '7200');
    session_save_path($sessionPath); session_name('rahmeen_session');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => isHttps() || $config['environment'] !== 'local', 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $_SESSION['orderScope'] ??= bin2hex(random_bytes(32));
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $route = trim((string) ($_GET['route'] ?? ''), '/');
    if (!preg_match('~^[a-zA-Z0-9/_-]*$~', $route)) fail(404, 'Endpoint not found.');
    if ($method !== 'GET' && $method !== 'HEAD') {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $expected = (isHttps() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '');
        if (($origin && strcasecmp(rtrim($origin, '/'), $expected) !== 0) || (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] === 'cross-site')) fail(403, 'This request must come from the store.');
        if (!hash_equals($_SESSION['csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403, 'Your session changed. Refresh the page and try again.');
        if ($config['environment'] !== 'local' && !isHttps()) fail(403, 'HTTPS is required.');
    }
    if ($route === 'session' && $method === 'GET') {
        $admin = adminSession();
        response(['authenticated' => $admin !== null, 'csrf' => $_SESSION['csrf'], 'checkoutScope' => hash('sha256', $_SESSION['orderScope']), 'admin' => $admin, 'setupRequired' => isLocalRequest() && (int) db()->query('SELECT COUNT(*) FROM admins')->fetchColumn() === 0]);
    }
    if ($route === 'catalogue' && $method === 'GET') response(['products' => getProducts(true), 'categories' => Rahmeen\CATEGORIES, 'settings' => settings()]);
    if ($route === 'setup' && $method === 'POST') {
        if (!isLocalRequest()) fail(403, 'First-admin setup is available only through the server CLI in production.');
        rateLimit('setup-ip', $_SERVER['REMOTE_ADDR'] ?? '', 8, 900);
        $input = requestBody();
        $admin = transaction(db(), function () use ($input): array {
            if (config()['driver'] === 'mysql') db()->query("SELECT value FROM meta WHERE meta_key = 'initialized' FOR UPDATE")->fetchColumn();
            if ((int) db()->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) fail(409, 'An administrator already exists. Please sign in.');
            return createAdmin(textField($input['name'] ?? '', 'name', 120, true), textField($input['email'] ?? '', 'email', 190, true), passwordField($input['password'] ?? null));
        });
        authenticate($admin);
        response(['authenticated' => true, 'csrf' => $_SESSION['csrf'], 'admin' => ['name' => $admin['name'], 'email' => $admin['email']]], 201);
    }
    if ($route === 'login' && $method === 'POST') {
        $input = requestBody();
        $email = strtolower(textField($input['email'] ?? '', 'email', 190, true));
        $password = passwordField($input['password'] ?? null);
        rateLimit('login-ip', $_SERVER['REMOTE_ADDR'] ?? '', 30, 900); rateLimit('login-email', $email, 10, 900);
        $stmt = db()->prepare('SELECT * FROM admins WHERE email = ?'); $stmt->execute([$email]); $admin = $stmt->fetch();
        $hash = $admin ? $admin['password_hash'] : '$2y$10$LhACgv3R.oDFyPI1SUUjVeGYAgLSGWqqLLuw9frAiOyHxnn.nVHNe';
        if (!password_verify($password, $hash) || !$admin) fail(401, 'The email or password is incorrect.');
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) db()->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $admin['id']]);
        authenticate($admin);
        response(['authenticated' => true, 'csrf' => $_SESSION['csrf'], 'admin' => ['name' => $admin['name'], 'email' => $admin['email']]]);
    }
    if ($route === 'logout' && $method === 'POST') {
        unset($_SESSION['adminId'], $_SESSION['adminLastActive']); session_regenerate_id(true);
        response(['authenticated' => false, 'csrf' => $_SESSION['csrf'], 'admin' => null]);
    }
    if (($route === 'orders' || $route === 'orders/quote') && $method === 'POST') {
        $quote = $route === 'orders/quote';
        rateLimit($quote ? 'quote-ip' : 'order-ip', $_SERVER['REMOTE_ADDR'] ?? '', $quote ? 100 : 25, 900);
        $input = requestBody();
        if (!$quote && array_key_exists('expectedCheckoutScope', $input) && (!is_string($input['expectedCheckoutScope']) || !hash_equals(hash('sha256', $_SESSION['orderScope']), $input['expectedCheckoutScope']))) {
            fail(409, 'Your checkout session changed. Track your earlier order before placing another one.', ['checkoutScope' => 'The original checkout session has expired.']);
        }
        $order = placeOrder($input, $_SESSION['orderScope'], null, $quote);
        response($quote ? $order : ['order' => $order], $quote ? 200 : 201);
    }
    if ($route === 'orders/track' && $method === 'POST') {
        rateLimit('track-ip', $_SERVER['REMOTE_ADDR'] ?? '', 20, 900);
        $input = requestBody();
        $number = strtoupper(textField($input['number'] ?? '', 'number', 40)); $phone = trackingPhone(textField($input['phone'] ?? '', 'phone', 30));
        $stmt = db()->prepare('SELECT * FROM orders WHERE number = ?'); $stmt->execute([$number]); $row = $stmt->fetch();
        $order = $row ? decodeOrder($row) : null;
        if (!$order || strlen($phone) < 10 || !hash_equals(trackingPhone($order['customer']['phone']), $phone)) fail(404, 'No order matches these details. Check your order number and phone number.');
        $public = array_intersect_key($order, array_flip(['number', 'status', 'paymentStatus', 'trackingNumber', 'createdAt', 'total', 'demoMode']));
        $public['items'] = array_map(fn($item) => array_intersect_key($item, array_flip(['name', 'size', 'color', 'quantity'])), $order['items']);
        response(['order' => $public]);
    }
    if (str_starts_with($route, 'admin/')) {
        if ($config['environment'] !== 'local' && !isHttps()) fail(403, 'HTTPS is required.');
        if (!adminSession()) fail(401, 'Please sign in to manage your store.');
        if ($route === 'admin/products' && $method === 'GET') response(['products' => getProducts()]);
        if ($route === 'admin/products' && $method === 'POST') {
            $product = validateProduct(requestBody());
            transaction(db(), function () use ($product): void {
                if (getProducts(false, $product['id'])) fail(409, 'A product with this identifier already exists.', ['id' => 'Choose a unique product identifier.']);
                saveProduct(db(), $product);
            });
            response(['product' => getProducts(false, $product['id'])[0]], 201);
        }
        if (preg_match('~^admin/products/([a-z0-9_-]+)$~', $route, $matches)) {
            $id = $matches[1];
            if ($method === 'PUT' || $method === 'DELETE') {
                $input = $method === 'PUT' ? requestBody() : [];
                transaction(db(), function () use ($id, $input, $method): void {
                    $stmt = db()->prepare('SELECT id, updated_at FROM products WHERE id = ?' . (config()['driver'] === 'mysql' ? ' FOR UPDATE' : '')); $stmt->execute([$id]);
                    $existing = $stmt->fetch();
                    if (!$existing) fail(404, 'Product not found.');
                    if ($method === 'DELETE') db()->prepare("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?")->execute([Rahmeen\nextProductVersion($existing['updated_at']), $id]);
                    else {
                        if (!isset($input['updatedAt']) || !is_string($input['updatedAt']) || !hash_equals($existing['updated_at'], $input['updatedAt'])) fail(409, 'This product or its inventory changed while you were editing. Reopen the product to load the latest stock before saving.', ['variants' => 'Reopen this product to refresh inventory.']);
                        saveProduct(db(), validateProduct($input, $id));
                    }
                });
                response(['product' => getProducts(false, $id)[0]]);
            }
        }
        if ($route === 'admin/orders' && $method === 'GET') response(['orders' => array_map('Rahmeen\\decodeOrder', db()->query('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 1000')->fetchAll())]);
        if (preg_match('~^admin/orders/([a-z0-9]+)$~', $route, $matches)) {
            if ($method === 'GET') response(['order' => decodeOrder(getOrder($matches[1]))]);
            if ($method === 'PATCH') response(['order' => updateOrder($matches[1], requestBody())]);
        }
        if ($route === 'admin/settings' && $method === 'GET') response(['settings' => settings()]);
        if ($route === 'admin/settings' && $method === 'PUT') response(['settings' => updateSettings(requestBody())]);
        if ($route === 'admin/dashboard' && $method === 'GET') {
            $pdo = db(); $products = getProducts();
            $low = [];
            foreach ($products as $product) if ($product['status'] === 'active') foreach ($product['variants'] as $variant) if ($variant['stock'] <= 5) $low[] = ['id' => $product['id'], 'name' => $product['name'], 'image' => $product['image'], 'category' => $product['category'], 'size' => $variant['size'], 'color' => $variant['color'], 'sku' => $variant['sku'], 'stock' => $variant['stock']];
            $stats = ['orders' => (int) $pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(), 'revenue' => (int) $pdo->query("SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE payment_status = 'paid' AND status <> 'cancelled'")->fetchColumn() / 100, 'pendingOrders' => (int) $pdo->query("SELECT COUNT(*) FROM orders WHERE status IN ('pending','confirmed','packed')")->fetchColumn(), 'activeProducts' => count(array_filter($products, fn($p) => $p['status'] === 'active')), 'lowStock' => count($low)];
            response(['stats' => $stats, 'recentOrders' => array_map('Rahmeen\\decodeOrder', $pdo->query('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 8')->fetchAll()), 'lowStockProducts' => array_slice($low, 0, 20)]);
        }
        if ($route === 'admin/upload' && $method === 'POST') {
            $file = $_FILES['image'] ?? null;
            if (!$file || !isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) fail(400, 'Choose an image under 8 MB.');
            if ($file['size'] > 8 * 1024 * 1024 || $file['size'] < 1) fail(400, 'Images must be under 8 MB.');
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
            if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) fail(400, 'Only JPEG, PNG and WebP images are supported.');
            $dimensions = @getimagesize($file['tmp_name']);
            if (!$dimensions || $dimensions[0] > 6000 || $dimensions[1] > 6000 || $dimensions[0] * $dimensions[1] > 24000000) fail(400, 'Use an image up to 6000 pixels per side and 24 megapixels.');
            $image = @imagecreatefromstring(file_get_contents($file['tmp_name']));
            if (!$image) fail(400, 'This image could not be read. Export it again as JPEG, PNG or WebP.');
            $directory = dirname(__DIR__) . '/uploads';
            if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('Image storage is unavailable.');
            $rules = "Options -Indexes\n<FilesMatch \"\\.(php[0-9]?|phtml|phar|cgi|pl|py|sh|shtml)$\">\nRequire all denied\n</FilesMatch>\nRemoveHandler .php .phtml .phar\nRemoveType .php .phtml .phar\n";
            if (!is_file($directory . '/.htaccess') && file_put_contents($directory . '/.htaccess', $rules, LOCK_EX) === false) throw new RuntimeException('Upload protection is unavailable.');
            $webp = function_exists('imagewebp');
            $filename = bin2hex(random_bytes(20)) . ($webp ? '.webp' : '.png');
            imagealphablending($image, false); imagesavealpha($image, true);
            $saved = $webp ? imagewebp($image, $directory . '/' . $filename, 88) : imagepng($image, $directory . '/' . $filename, 7);
            imagedestroy($image);
            if (!$saved) throw new RuntimeException('The image could not be saved.');
            response(['url' => '/uploads/' . $filename], 201);
        }
    }
    fail(404, 'Endpoint not found.');
} catch (ApiException $error) {
    response(array_filter(['error' => $error->getMessage(), 'fields' => $error->fields], fn($value) => $value !== []), $error->status);
} catch (Throwable $error) {
    error_log('RAHMEEN API: ' . get_class($error) . ': ' . $error->getMessage());
    response(['error' => 'The store could not complete this request. Please try again.'], 500);
}
