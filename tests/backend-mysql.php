<?php
declare(strict_types=1);

// Optional integration suite for a disposable, loopback-only MariaDB/MySQL
// instance. Explicit test port is required; a randomly named database is created
// and dropped. Never point this at the real store's database server.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$port = filter_var(getenv('RAHMEEN_TEST_MYSQL_PORT'), FILTER_VALIDATE_INT);
if (!$port || $port < 1024 || $port > 65535) { fwrite(STDERR, "Set RAHMEEN_TEST_MYSQL_PORT for a disposable loopback database server.\n"); exit(1); }
$user = getenv('RAHMEEN_TEST_MYSQL_USER') ?: 'root';
$password = getenv('RAHMEEN_TEST_MYSQL_PASSWORD') ?: '';
$database = 'rahmeen_test_' . bin2hex(random_bytes(8));
$server = new PDO('mysql:host=127.0.0.1;port=' . $port . ';charset=utf8mb4', $user, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec('CREATE DATABASE `' . $database . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$passed = 0;
function mysqlCheck(bool $condition, string $label): void {
    global $passed;
    if (!$condition) throw new RuntimeException('FAIL ' . $label);
    $passed++; fwrite(STDOUT, 'PASS ' . $label . "\n");
}
try {
    putenv('APP_ENV=local'); putenv('RAHMEEN_DB_DRIVER=mysql'); putenv('RAHMEEN_DB_HOST=127.0.0.1'); putenv('RAHMEEN_DB_PORT=' . $port);
    putenv('RAHMEEN_DB_NAME=' . $database); putenv('RAHMEEN_DB_USER=' . $user); putenv('RAHMEEN_DB_PASSWORD=' . $password);
    putenv('RAHMEEN_STORAGE_DIR=' . dirname(__DIR__) . '/storage/test-mysql-' . bin2hex(random_bytes(6)));
    require dirname(__DIR__) . '/app/bootstrap.php';
    $pdo = Rahmeen\db();
    $products = Rahmeen\getProducts();
    mysqlCheck(count($products) === 9, 'Native prepared statements create MySQL schema and seed catalogue');
    $p = $products[0]; $variant = $p['variants'][0];
    $customer = ['name' => 'Database Tester', 'phone' => '03001234567', 'address' => '10 Database Test Street', 'city' => 'Lahore', 'province' => 'Punjab'];
    $input = ['requestId' => 'mysql-order-0000000001', 'customer' => $customer, 'paymentMethod' => 'cod', 'items' => [['id' => $p['id'], 'size' => $variant['size'], 'color' => $variant['color'], 'quantity' => 2]]];
    $order = Rahmeen\placeOrder($input, 'mysql-test-scope');
    $replay = Rahmeen\placeOrder($input, 'mysql-test-scope');
    mysqlCheck($order['id'] === $replay['id'], 'MySQL checkout retry is idempotent');
    $stock = fn() => Rahmeen\getProducts(false, $p['id'])[0]['variants'][0]['stock'];
    mysqlCheck($stock() === 8, 'MySQL reserves stock only once');
    Rahmeen\updateOrder($order['id'], ['status' => 'cancelled']); Rahmeen\updateOrder($order['id'], ['status' => 'cancelled']);
    mysqlCheck($stock() === 10, 'MySQL cancellation restores inventory once');
    $pdo->prepare('UPDATE products SET updated_at = ? WHERE id = ?')->execute(['2099-01-01T00:00:00.000000Z', $p['id']]);
    $input['requestId'] = 'mysql-order-0000000002'; Rahmeen\placeOrder($input, 'mysql-test-scope');
    mysqlCheck(Rahmeen\getProducts(false, $p['id'])[0]['updatedAt'] === '2099-01-01T00:00:00.000001Z', 'MySQL product version is monotonic across a backwards clock');
    $large = $p; $large['id'] = 'large-order-test'; $large['price'] = 100;
    $large['image'] = 'https://example.test/' . str_repeat('image', 280) . '.jpg'; $large['images'] = [$large['image']];
    $large['sizes'] = array_map(fn($n) => 'Size ' . $n, range(1, 10));
    $large['colors'] = array_map(fn($n) => ['name' => 'Colour ' . $n, 'hex' => '#112233'], range(1, 5));
    $large['variants'] = []; $items = [];
    foreach ($large['sizes'] as $size) foreach ($large['colors'] as $color) {
        $large['variants'][] = ['size' => $size, 'color' => $color['name'], 'sku' => $size . '-' . $color['name'], 'stock' => 2];
        $items[] = ['id' => $large['id'], 'size' => $size, 'color' => $color['name'], 'quantity' => 1];
    }
    $large = Rahmeen\validateProduct($large); Rahmeen\transaction($pdo, fn() => Rahmeen\saveProduct($pdo, $large));
    $input['requestId'] = 'mysql-large-order-00001'; $input['items'] = $items;
    $bigOrder = Rahmeen\placeOrder($input, 'mysql-test-scope');
    $stored = Rahmeen\getOrder($bigOrder['id']);
    mysqlCheck(strlen($stored['payload']) > 65535 && count(Rahmeen\decodeOrder($stored)['items']) === 50, 'MySQL stores a valid 50-line order larger than the old TEXT limit');
    mysqlCheck($pdo->query("SHOW COLUMNS FROM orders LIKE 'payload'")->fetch()['Type'] === 'mediumtext', 'Order payload uses MEDIUMTEXT on MySQL');
    fwrite(STDOUT, "\n$passed MySQL assertions passed.\n");
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n" . $error->getTraceAsString() . "\n"); $failed = true;
} finally {
    $server->exec('DROP DATABASE `' . $database . '`');
}
exit(isset($failed) ? 1 : 0);
