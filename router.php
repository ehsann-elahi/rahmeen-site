<?php
declare(strict_types=1);

// PHP development server only. Start with APP_ENV=local and bind to loopback.
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if (str_contains($path, "\0") || str_contains($path, '\\') || preg_match('~(?:^|/)\.{1,2}(?:/|$)~', $path)) { http_response_code(404); exit; }
$public = __DIR__ . '/dist';
if ($path === '/api/index.php' || $path === '/api' || $path === '/api/') { require $public . '/api/index.php'; return true; }
if ($path === '/') $path = '/index.html';
if ($path === '/admin') { header('Location: /admin/', true, 302); return true; }
if ($path === '/admin/') $path = '/admin/index.html';
$file = realpath($public . $path);
$root = realpath($public);
$extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$types = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'json' => 'application/json', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon', 'woff' => 'font/woff', 'woff2' => 'font/woff2'];
if (!$file || !is_file($file) || !str_starts_with(strtolower(str_replace('\\', '/', $file)), strtolower(str_replace('\\', '/', $root)) . '/') || !isset($types[$extension]) || preg_match('~(?:^|/)\.~', $path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Not found'; return true; }
header('Content-Type: ' . $types[$extension]); header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($file);
return true;
