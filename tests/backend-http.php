<?php
declare(strict_types=1);

// Launches an isolated loopback server and exercises the real JSON/session API.
// Uses only PHP standard extensions. All data lives under storage/test-http-*.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
$testDirectory = $root . '/storage/test-http-' . bin2hex(random_bytes(6));
mkdir($testDirectory, 0700, true);
$socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
if (!$socket) throw new RuntimeException('Could not allocate a test port.');
$address = stream_socket_get_name($socket, false); fclose($socket);
$environment = getenv(); $environment['APP_ENV'] = 'local'; $environment['RAHMEEN_DB_DRIVER'] = 'sqlite'; $environment['RAHMEEN_STORAGE_DIR'] = $testDirectory;
$process = proc_open([PHP_BINARY, '-d', 'upload_max_filesize=8M', '-d', 'post_max_size=10M', '-d', 'upload_tmp_dir=' . $testDirectory, '-S', $address, '-t', $root . '/dist', $root . '/router.php'], [0 => ['pipe', 'r'], 1 => ['file', $testDirectory . '/server.log', 'a'], 2 => ['file', $testDirectory . '/server.log', 'a']], $pipes, $root, $environment);
if (!is_resource($process)) throw new RuntimeException('Could not start the PHP test server.');
fclose($pipes[0]);
$base = 'http://' . $address;
$passed = 0;
$exitCode = 0;
$uploadedFile = null;
function checkHttp(bool $condition, string $message): void {
    global $passed;
    if (!$condition) throw new RuntimeException('FAIL: ' . $message);
    $passed++; fwrite(STDOUT, 'PASS ' . $message . "\n");
}
function request(string $route, string $method = 'GET', ?array $body = null, array &$browser = [], array $extraHeaders = [], ?string $raw = null): array {
    global $base;
    $headers = ['Accept: application/json'];
    if (isset($browser['cookie'])) $headers[] = 'Cookie: ' . $browser['cookie'];
    if ($method !== 'GET' && isset($browser['csrf'])) $headers[] = 'X-CSRF-Token: ' . $browser['csrf'];
    if ($raw === null && $body !== null) $headers[] = 'Content-Type: application/json';
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", array_merge($headers, $extraHeaders)), 'content' => $raw ?? ($body !== null ? json_encode($body, JSON_THROW_ON_ERROR) : ''), 'ignore_errors' => true, 'timeout' => 10]]);
    $data = @file_get_contents($base . '/api/index.php?route=' . rawurlencode($route), false, $context);
    $responseHeaders = $http_response_header ?? [];
    preg_match('/\s(\d{3})\s/', $responseHeaders[0] ?? '', $match); $status = (int) ($match[1] ?? 0);
    foreach ($responseHeaders as $header) if (stripos($header, 'Set-Cookie: rahmeen_session=') === 0) $browser['cookie'] = explode(';', substr($header, strlen('Set-Cookie: ')))[0];
    $parsed = json_decode((string) $data, true);
    return ['status' => $status, 'json' => $parsed, 'headers' => $responseHeaders, 'raw' => $data];
}
function startSession(array &$browser): array {
    $result = request('session', 'GET', null, $browser);
    $browser['csrf'] = $result['json']['csrf'] ?? '';
    return $result;
}
try {
    $ready = false;
    for ($attempt = 0; $attempt < 60; $attempt++) {
        $connection = @stream_socket_client('tcp://' . $address, $errno, $error, 0.1);
        if ($connection) { fclose($connection); $ready = true; break; }
        usleep(100000);
    }
    checkHttp($ready, 'Isolated loopback API starts');
    $guest = []; $session = startSession($guest);
    checkHttp($session['status'] === 200 && $session['json']['authenticated'] === false && $session['json']['setupRequired'] === true, 'Guest session exposes local-only first-admin setup');
    checkHttp(strlen($guest['csrf']) === 64 && isset($guest['cookie']), 'Guest receives CSRF token and session cookie');
    $repeatSession = startSession($guest);
    checkHttp((bool) preg_match('/^[a-f0-9]{64}$/', $session['json']['checkoutScope'] ?? '') && $repeatSession['json']['checkoutScope'] === $session['json']['checkoutScope'] && !isset($session['json']['orderScope']), 'Session exposes only a stable opaque checkout scope identifier');
    $otherGuest = []; $otherSession = startSession($otherGuest);
    checkHttp($otherSession['json']['checkoutScope'] !== $session['json']['checkoutScope'], 'A new customer session has a different checkout scope');
    checkHttp((bool) array_filter($session['headers'], fn($h) => stripos($h, 'HttpOnly') !== false && stripos($h, 'SameSite=Lax') !== false), 'Session cookie is HttpOnly and SameSite=Lax');
    $denied = request('admin/products', 'GET', null, $guest);
    checkHttp($denied['status'] === 401, 'Guest cannot read admin products');
    $catalogue = request('catalogue', 'GET', null, $guest);
    checkHttp($catalogue['status'] === 200 && count($catalogue['json']['products']) === 9 && count($catalogue['json']['categories']) === 3, 'Public catalogue returns fixed categories and inventory');
    $noToken = ['cookie' => $guest['cookie']];
    $denied = request('orders', 'POST', [], $noToken);
    checkHttp($denied['status'] === 403, 'Mutation without CSRF token rejected');
    $denied = request('orders', 'POST', [], $guest, ['Origin: https://malicious.example']);
    checkHttp($denied['status'] === 403, 'Cross-origin mutation rejected even with token');
    $product = $catalogue['json']['products'][0]; $variant = $product['variants'][0];
    $items = [['id' => $product['id'], 'size' => $variant['size'], 'color' => $variant['color'], 'quantity' => 2]];
    $quote = request('orders/quote', 'POST', ['items' => $items, 'paymentMethod' => 'cod'], $guest);
    checkHttp($quote['status'] === 200 && $quote['json']['total'] === $product['price'] * 2 + 250, 'API quote works without delivery information');
    $customer = ['name' => 'API Test Customer', 'email' => 'private@example.test', 'phone' => '03001234567', 'address' => 'Private Street, Test House 10', 'city' => 'Lahore', 'province' => 'Punjab', 'postalCode' => '', 'notes' => 'Delivery notes stay private'];
    $orderInput = ['requestId' => 'http-order-0000000001', 'customer' => $customer, 'items' => $items, 'paymentMethod' => 'cod', 'expectedTotal' => $quote['json']['total'], 'expectedCheckoutScope' => $session['json']['checkoutScope']];
    $placed = request('orders', 'POST', $orderInput, $guest);
    checkHttp($placed['status'] === 201 && isset($placed['json']['order']['number']), 'Customer can place a server-persisted order');
    $order = $placed['json']['order'];
    $replay = request('orders', 'POST', $orderInput, $guest);
    checkHttp($replay['status'] === 201 && $replay['json']['order']['id'] === $order['id'], 'HTTP duplicate submit returns same order');
    $expiredRetry = request('orders', 'POST', $orderInput, $otherGuest);
    checkHttp($expiredRetry['status'] === 409 && isset($expiredRetry['json']['fields']['checkoutScope']), 'A pending checkout cannot be replayed after its customer session changes');
    $tracked = request('orders/track', 'POST', ['number' => $order['number'], 'phone' => '+923001234567'], $guest);
    checkHttp($tracked['status'] === 200 && $tracked['json']['order']['number'] === $order['number'], 'Tracking accepts matching Pakistan phone formatting');
    checkHttp(!isset($tracked['json']['order']['customer']) && !str_contains($tracked['raw'], 'Private Street') && !str_contains($tracked['raw'], 'private@example.test') && !str_contains($tracked['raw'], 'Delivery notes'), 'Tracking excludes contact, delivery, and private notes');
    $wrongPhone = request('orders/track', 'POST', ['number' => $order['number'], 'phone' => '03009876543'], $guest);
    $wrongNumber = request('orders/track', 'POST', ['number' => 'RA-NOT-AN-ORDER', 'phone' => '03009876543'], $guest);
    checkHttp($wrongPhone['status'] === 404 && $wrongPhone['json'] === $wrongNumber['json'], 'Tracking does not reveal whether a guessed order exists');
    $admin = []; startSession($admin);
    $setup = request('setup', 'POST', ['name' => 'Integration Admin', 'email' => 'admin@example.test', 'password' => 'Temporary-Test-Password-Only'], $admin);
    checkHttp($setup['status'] === 201 && $setup['json']['authenticated'] === true, 'Loopback first admin setup authenticates securely');
    $second = request('setup', 'POST', ['name' => 'Other', 'email' => 'other@example.test', 'password' => 'Temporary-Test-Password-Only'], $guest);
    checkHttp($second['status'] === 409, 'First-admin setup closes once an admin exists');
    $orders = request('admin/orders', 'GET', null, $admin);
    checkHttp($orders['status'] === 200 && $orders['json']['orders'][0]['customer']['address'] === $customer['address'], 'Only authenticated admin can read delivery details');
    $products = request('admin/products', 'GET', null, $admin);
    $fresh = array_values(array_filter($products['json']['products'], fn($p) => $p['id'] === $product['id']))[0];
    $stale = request('admin/products/' . $product['id'], 'PUT', $product, $admin);
    checkHttp($stale['status'] === 409, 'Stale admin edit cannot overwrite inventory reserved during checkout');
    $fresh['name'] = 'Updated Product';
    $saved = request('admin/products/' . $product['id'], 'PUT', $fresh, $admin);
    checkHttp($saved['status'] === 200 && $saved['json']['product']['name'] === 'Updated Product', 'Fresh authenticated product edit persists');
    $badCategory = $saved['json']['product']; $badCategory['category'] = 'New category';
    $invalid = request('admin/products/' . $product['id'], 'PUT', $badCategory, $admin);
    checkHttp($invalid['status'] === 400, 'API cannot change the fixed category set');
    $cancel = request('admin/orders/' . $order['id'], 'PATCH', ['status' => 'cancelled', 'notes' => 'Private admin cancellation'], $admin);
    checkHttp($cancel['status'] === 200 && $cancel['json']['order']['status'] === 'cancelled', 'Admin order status update persists');
    $reopen = request('admin/orders/' . $order['id'], 'PATCH', ['status' => 'pending'], $admin);
    checkHttp($reopen['status'] === 409, 'HTTP cancelled order reopening rejected');
    $dashboard = request('admin/dashboard', 'GET', null, $admin);
    checkHttp($dashboard['status'] === 200 && $dashboard['json']['stats']['orders'] === 1 && $dashboard['json']['stats']['revenue'] === 0, 'Dashboard reports persisted order and collected-revenue totals');
    // Multipart image test: unsafe SVG is rejected before it reaches uploads.
    $boundary = 'rahmeen-test-' . bin2hex(random_bytes(8));
    $multipart = '--' . $boundary . "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"bad.svg\"\r\nContent-Type: image/svg+xml\r\n\r\n<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>\r\n--" . $boundary . "--\r\n";
    $upload = request('admin/upload', 'POST', null, $admin, ['Content-Type: multipart/form-data; boundary=' . $boundary], $multipart);
    checkHttp($upload['status'] === 400, 'Active SVG upload is rejected');
    $fixture = imagecreatetruecolor(2, 2); ob_start(); imagepng($fixture); $imageBytes = ob_get_clean(); imagedestroy($fixture);
    $multipart = '--' . $boundary . "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"unsafe.php\"\r\nContent-Type: image/png\r\n\r\n" . $imageBytes . '<?php echo "unsafe-upload-payload"; ?>' . "\r\n--" . $boundary . "--\r\n";
    $upload = request('admin/upload', 'POST', null, $admin, ['Content-Type: multipart/form-data; boundary=' . $boundary], $multipart);
    $uploadUrl = $upload['json']['url'] ?? '';
    checkHttp($upload['status'] === 201 && (bool) preg_match('~^/uploads/[a-f0-9]{40}\.(?:webp|png)$~', $uploadUrl), 'Valid image is re-encoded with a generated safe extension');
    $uploadedFile = $root . '/dist' . $uploadUrl;
    $uploadedBytes = file_get_contents($base . $uploadUrl);
    checkHttp(!str_contains($uploadedBytes, 'unsafe-upload-payload') && getimagesizefromstring($uploadedBytes)[0] === 2, 'Uploaded image is served as pixels without appended executable content');
    $logOut = request('logout', 'POST', [], $admin);
    $denied = request('admin/orders', 'GET', null, $admin);
    checkHttp($logOut['status'] === 200 && $denied['status'] === 401, 'Logout removes admin access');
    $badLogin = request('login', 'POST', ['email' => 'admin@example.test', 'password' => 'Wrong-Password-Only'], $admin);
    checkHttp($badLogin['status'] === 401, 'Wrong password rejected');
    $login = request('login', 'POST', ['email' => 'admin@example.test', 'password' => 'Temporary-Test-Password-Only'], $admin);
    checkHttp($login['status'] === 200 && $login['json']['authenticated'] === true, 'Correct password logs in after session rotation');
    $privatePaths = ['/app/bootstrap.php', '/config.php', '/storage/rahmeen.sqlite', '/scripts/create-admin.php', '/%2e%2e/app/bootstrap.php'];
    foreach ($privatePaths as $path) {
        $context = stream_context_create(['http' => ['ignore_errors' => true]]);
        @file_get_contents($base . $path, false, $context);
        checkHttp(str_contains($http_response_header[0] ?? '', '404'), 'Router blocks private path ' . $path);
    }
    @file_get_contents($base . '/admin/', false, stream_context_create(['http' => ['ignore_errors' => true]]));
    checkHttp(str_contains($http_response_header[0] ?? '', '200'), 'Local router serves admin index');
    fwrite(STDOUT, "\n$passed HTTP assertions passed. Isolated data/log: $testDirectory\n");
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    if (is_file($testDirectory . '/server.log')) fwrite(STDERR, file_get_contents($testDirectory . '/server.log'));
    $exitCode = 1;
} finally {
    proc_terminate($process); proc_close($process);
    // Only remove the exact random image created by this test, never a directory
    // or another merchant upload.
    if ($uploadedFile !== null && is_file($uploadedFile)) unlink($uploadedFile);
}
exit($exitCode);
