<?php
// Simple standalone script to debug configuration and environment
define('LARAVEL_START', microtime(true));

if (file_exists(__DIR__.'/../vendor/autoload.php')) {
    require __DIR__.'/../vendor/autoload.php';
    $app = require_once __DIR__.'/../bootstrap/app.php';
} else {
    require __DIR__.'/../../backend_cpl/vendor/autoload.php';
    $app = require_once __DIR__.'/../../backend_cpl/bootstrap/app.php';
}

$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
// Handle the request to boot the application and load configs
$response = $kernel->handle(
    $request = Illuminate\Http\Request::capture()
);

header('Content-Type: application/json');
echo json_encode([
    'session_driver' => config('session.driver'),
    'session_cookie' => config('session.cookie'),
    'session_domain' => config('session.domain'),
    'session_secure' => config('session.secure'),
    'session_path' => config('session.path'),
    'sanctum_stateful' => config('sanctum.stateful'),
    'app_url' => config('app.url'),
    'session_dir_writable' => is_writable(storage_path('framework/sessions')),
    'cookies_received' => $_COOKIE,
    'request_headers' => getallheaders(),
], JSON_PRETTY_PRINT);
