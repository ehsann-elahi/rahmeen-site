<?php
declare(strict_types=1);

// Isolated SQLite business-rule tests. No running server or real store data used.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$testDirectory = dirname(__DIR__) . '/storage/test-' . bin2hex(random_bytes(6));
putenv('APP_ENV=local'); putenv('RAHMEEN_DB_DRIVER=sqlite'); putenv('RAHMEEN_STORAGE_DIR=' . $testDirectory);
require dirname(__DIR__) . '/app/bootstrap.php';

use function Rahmeen\{db, getProducts, validateProduct, saveProduct, placeOrder, updateOrder, getOrder, decodeOrder, updateSettings, createAdmin, rateLimit, transaction};
use Rahmeen\ApiException;

$passed = 0;
function check(bool $condition, string $message): void {
    global $passed;
    if (!$condition) throw new RuntimeException('FAIL: ' . $message);
    $passed++; fwrite(STDOUT, 'PASS ' . $message . "\n");
}
function rejects(callable $callback, int $status, string $message): void {
    try { $callback(); } catch (ApiException $error) { check($error->status === $status, $message . ' (HTTP ' . $error->status . ')'); return; }
    throw new RuntimeException('FAIL: ' . $message . ' did not reject');
}
function stock(string $id, string $size, string $color): int {
    foreach (getProducts(false, $id)[0]['variants'] as $variant) if ($variant['size'] === $size && $variant['color'] === $color) return $variant['stock'];
    throw new RuntimeException('Variant not found');
}

try {
    $pdo = db();
    $products = getProducts(true);
    check(count($products) === 9, 'Seed products initialize once');
    check(count(getProducts(true)) === 9, 'Repeated reads do not duplicate seeds');
    check(Rahmeen\CATEGORIES === ['Ready to Wear', 'Unstitched', 'Festive'], 'Only the original three categories exist');
    $product = $products[0]; $variant = $product['variants'][0];
    $id = $product['id']; $size = $variant['size']; $color = $variant['color'];
    check(stock($id, $size, $color) === 10, 'Seed inventory is ten per variant');
    $futureVersion = '2099-01-01T00:00:00.000000Z';
    check(Rahmeen\nextProductVersion($futureVersion) === '2099-01-01T00:00:00.000001Z', 'Product version advances even when the wall clock repeats or moves backwards');
    $pdo->prepare('UPDATE products SET updated_at = ? WHERE id = ?')->execute([$futureVersion, $id]);
    rejects(fn() => validateProduct(array_replace($product, ['category' => 'Accessories'])), 400, 'Unknown category rejected');
    rejects(fn() => validateProduct(array_replace($product, ['image' => 'javascript:alert(1)'])), 400, 'Executable image URL rejected');
    rejects(fn() => validateProduct(array_replace($product, ['price' => -1])), 400, 'Negative product price rejected');
    rejects(fn() => validateProduct(array_replace($product, ['variants' => []])), 400, 'Incomplete inventory matrix rejected');
    $badVariants = $product['variants']; $badVariants[0]['stock'] = 1.5;
    rejects(fn() => validateProduct(array_replace($product, ['variants' => $badVariants])), 400, 'Fractional inventory rejected');
    $customer = ['name' => 'Integration Tester', 'email' => 'test@example.test', 'phone' => '03001234567', 'address' => '10 Test Street, Gulberg', 'city' => 'Lahore', 'province' => 'Punjab', 'postalCode' => '54000', 'notes' => 'Test only'];
    $input = ['requestId' => 'test-order-0000000001', 'customer' => $customer, 'items' => [['id' => $id, 'size' => $size, 'color' => $color, 'quantity' => 2, 'price' => 1]], 'paymentMethod' => 'cod', 'total' => 1];
    $quote = placeOrder($input, 'session-a', null, true);
    check($quote['subtotal'] === $product['price'] * 2 && $quote['total'] === $product['price'] * 2 + 250, 'Quote uses server prices and configured shipping');
    check(stock($id, $size, $color) === 10 && (int) $pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn() === 0, 'Quote does not reserve inventory or create orders');
    $order = placeOrder($input, 'session-a');
    check($order['total'] === $product['price'] * 2 + 250, 'Order ignores client price and total');
    check($order['demoMode'] === true && $order['status'] === 'pending' && $order['paymentStatus'] === 'unpaid', 'Order snapshots demo and initial payment status');
    check(!isset($order['customer']) && !isset($order['notes']), 'Public order response excludes private delivery and admin details');
    check(stock($id, $size, $color) === 8, 'Order reserves exact inventory');
    check(getProducts(false, $id)[0]['updatedAt'] === '2099-01-01T00:00:00.000001Z', 'Checkout always invalidates a previously loaded product version');
    $replay = placeOrder($input, 'session-a');
    check($replay['id'] === $order['id'] && stock($id, $size, $color) === 8, 'Retry is idempotent and does not double-reserve');
    $other = placeOrder($input, 'session-b');
    check($other['id'] !== $order['id'] && stock($id, $size, $color) === 6, 'Request idempotency is isolated between customer sessions');
    $bad = $input; $bad['requestId'] = 'invalid-size-0000001'; $bad['items'][0]['size'] = 'nonexistent';
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Unavailable size rejected');
    $bad = $input; $bad['requestId'] = 'invalid-qty-00000001'; $bad['items'][0]['quantity'] = -2;
    rejects(fn() => placeOrder($bad, 'session-a'), 400, 'Negative order quantity rejected');
    $bad = $input; $bad['requestId'] = 'oversell-00000000001'; $bad['items'][0]['quantity'] = 7;
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Overselling rejected');
    check(stock($id, $size, $color) === 6, 'Failed reservation leaves inventory unchanged');
    $otherProduct = $products[1]; $otherVariant = $otherProduct['variants'][0];
    $bad = $input; $bad['requestId'] = 'atomic-order-00000001';
    $bad['items'] = [['id' => $otherProduct['id'], 'size' => $otherVariant['size'], 'color' => $otherVariant['color'], 'quantity' => 2], ['id' => $id, 'size' => $size, 'color' => $color, 'quantity' => 7]];
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Multi-item order fails atomically');
    check(stock($otherProduct['id'], $otherVariant['size'], $otherVariant['color']) === 10, 'Failed order rolls back other item reservations');
    $bad = $input; $bad['requestId'] = 'duplicate-0000000001'; $bad['items'][] = $bad['items'][0]; $bad['items'][0]['quantity'] = 5;
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Duplicate bag lines are combined before stock checks');
    $bad = $input; $bad['requestId'] = 'bad-phone-0000000001'; $bad['customer']['phone'] = '123';
    rejects(fn() => placeOrder($bad, 'session-a'), 400, 'Invalid delivery contact rejected');
    updateSettings(['codEnabled' => false]);
    $bad = $input; $bad['requestId'] = 'cod-disabled-0000001';
    rejects(fn() => placeOrder($bad, 'session-a'), 400, 'Disabled COD cannot be submitted directly');
    updateSettings(['codEnabled' => true, 'shippingFee' => 350]);
    $quote = placeOrder($input, 'session-a', null, true);
    check($quote['shippingFee'] === 350.0 || $quote['shippingFee'] === 350, 'Quote uses newly configured shipping');
    $bad = $input; $bad['requestId'] = 'stale-price-00000001'; $bad['expectedTotal'] = $product['price'] * 2 + 250;
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Changed checkout total requires customer review');
    check(stock($id, $size, $color) === 6, 'Unreviewed price change rolls back stock reservation');
    $bad = $input; $bad['requestId'] = 'stale-mode-000000001'; $bad['expectedDemoMode'] = false;
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Changed demo/live mode requires customer review');
    check(stock($id, $size, $color) === 6, 'Unreviewed store mode leaves inventory unchanged');
    rejects(fn() => updateSettings(['shippingFee' => -100]), 400, 'Negative shipping setting rejected');
    $cancelled = updateOrder($order['id'], ['status' => 'cancelled', 'notes' => 'Test cancellation']);
    check($cancelled['status'] === 'cancelled' && stock($id, $size, $color) === 8, 'Cancellation restores reserved stock');
    updateOrder($order['id'], ['status' => 'cancelled']);
    check(stock($id, $size, $color) === 8, 'Repeated cancellation cannot restock twice');
    rejects(fn() => updateOrder($order['id'], ['status' => 'pending']), 409, 'Cancelled orders cannot reopen');
    updateOrder($other['id'], ['status' => 'delivered', 'paymentStatus' => 'paid', 'trackingNumber' => 'TEST123']);
    rejects(fn() => updateOrder($other['id'], ['status' => 'cancelled']), 409, 'Delivered order cannot be cancelled to mint stock');
    $archived = getProducts(false, $id)[0]; $archived['status'] = 'archived';
    transaction($pdo, fn() => saveProduct($pdo, validateProduct($archived)));
    check(count(getProducts(true)) === 8 && count(getProducts()) === 9, 'Archiving hides product without destroying history');
    $bad = $input; $bad['requestId'] = 'archived-order-000001';
    rejects(fn() => placeOrder($bad, 'session-a'), 409, 'Archived product cannot be ordered by forged ID');
    check(decodeOrder(getOrder($other['id']))['items'][0]['name'] === $product['name'], 'Historical order retains original product snapshot');
    rejects(fn() => createAdmin('Test', 'admin@example.test', 'short'), 400, 'Weak admin bootstrap password rejected');
    $admin = createAdmin('Store Owner', 'admin@example.test', 'Only-A-Test-Password-42');
    $hash = $pdo->query('SELECT password_hash FROM admins')->fetchColumn();
    check(password_verify('Only-A-Test-Password-42', $hash) && $hash !== 'Only-A-Test-Password-42', 'Admin password is stored as a secure password hash');
    rateLimit('test-limit', 'same-identity', 2, 60); rateLimit('test-limit', 'same-identity', 2, 60);
    rejects(fn() => rateLimit('test-limit', 'same-identity', 2, 60), 429, 'Persisted rate limit blocks excess attempts');
    fwrite(STDOUT, "\n$passed backend assertions passed. Isolated test database: $testDirectory\n");
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n" . $error->getTraceAsString() . "\n"); exit(1);
}
