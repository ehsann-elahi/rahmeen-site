<?php
declare(strict_types=1);
// This file MUST stay outside the public document root.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/app/bootstrap.php';

function prompt(string $label): string { fwrite(STDOUT, $label . ': '); return trim((string) fgets(STDIN)); }
function passwordPrompt(string $label): string {
    $hidden = PHP_OS_FAMILY !== 'Windows' && function_exists('shell_exec') && function_exists('stream_isatty') && stream_isatty(STDIN);
    if (!$hidden) return prompt($label);
    $state = trim((string) shell_exec('stty -g 2>/dev/null'));
    if ($state === '' || !preg_match('/^[a-zA-Z0-9:;]+$/', $state)) return prompt($label);
    fwrite(STDOUT, $label . ': ');
    shell_exec('stty -echo');
    try { return rtrim((string) fgets(STDIN), "\r\n"); }
    finally { shell_exec('stty ' . escapeshellarg($state)); fwrite(STDOUT, "\n"); }
}
try {
    fwrite(STDOUT, "RAHMEEN — create administrator\nThis creates a real administrator in the configured database.\n");
    $name = prompt('Full name'); $email = prompt('Email');
    // Password input is supplied interactively, never through command arguments
    // or environment variables that might be captured in shell history.
    fwrite(STDOUT, "Password must have at least 12 characters. Password input is hidden on supported Unix terminals.\n");
    $password = passwordPrompt('Password'); $confirm = passwordPrompt('Repeat password');
    if (!hash_equals($password, $confirm)) throw new RuntimeException('Passwords do not match.');
    $admin = Rahmeen\createAdmin($name, $email, $password);
    fwrite(STDOUT, "Administrator created for " . $admin['email'] . ". Sign in at /admin/.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "Administrator was not created: " . ($error instanceof Rahmeen\ApiException ? $error->getMessage() : 'Check the database configuration and make sure this email is not already registered.') . "\n");
    exit(1);
}
