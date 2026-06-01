<?php
define('LARAVEL_START', microtime(true));

if (file_exists(__DIR__.'/../vendor/autoload.php')) {
    require __DIR__.'/../vendor/autoload.php';
    $app = require_once __DIR__.'/../bootstrap/app.php';
} else {
    require __DIR__.'/../../backend_cpl/vendor/autoload.php';
    $app = require_once __DIR__.'/../../backend_cpl/bootstrap/app.php';
}

$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$response = $kernel->handle(
    $request = Illuminate\Http\Request::capture()
);

header('Content-Type: application/json');

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

try {
    $tables = ['users', 'departments', 'students', 'courses', 'cpls', 'course_cpl_mappings', 'student_grades'];
    $counts = [];
    
    foreach ($tables as $table) {
        if (Schema::hasTable($table)) {
            $counts[$table] = DB::table($table)->count();
        } else {
            $counts[$table] = 'Table does not exist';
        }
    }
    
    echo json_encode([
        'status' => 'success',
        'database_name' => DB::connection()->getDatabaseName(),
        'counts' => $counts
    ], JSON_PRETTY_PRINT);
} catch (\Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
