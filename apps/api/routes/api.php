<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\CourseController;
use App\Http\Controllers\CplController;
use App\Http\Controllers\MappingController;
use App\Http\Controllers\GradeController;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

Route::get('/reset-superadmin', function () {
    $user = \App\Models\User::where('role', 'super_admin')->first();
    if (!$user) {
        $user = \App\Models\User::create([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'name' => 'Super Admin PNB',
            'email' => 'superadmin@cpl-pnb.ac.id',
            'password' => \Illuminate\Support\Facades\Hash::make('password'),
            'role' => 'super_admin',
        ]);
        return response()->json(['message' => 'Superadmin created successfully with password: password']);
    }
    $user->password = \Illuminate\Support\Facades\Hash::make('password');
    $user->save();
    return response()->json(['message' => 'Superadmin password reset successfully to: password']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    
    // Frontend compatibility and custom routes MUST be before resource routes
    Route::get('/cpl/averages', [CplController::class, 'averages']);
    Route::get('/cpl/achievements/{id}', [CplController::class, 'achievements']);
    Route::get('/cpl', [CplController::class, 'index']);
    Route::post('/cpl', [CplController::class, 'store']);
    Route::put('/cpl/{id}', [CplController::class, 'update']);
    Route::delete('/cpl/{id}', [CplController::class, 'destroy']);
    
    // Bulk endpoints
    Route::post('/cpl/bulk', [CplController::class, 'bulk']);
    Route::post('/courses/bulk', [CourseController::class, 'bulk']);
    Route::post('/mappings/bulk', [MappingController::class, 'bulk']);
    Route::post('/students/bulk', [StudentController::class, 'bulk']);
    Route::post('/grades/bulk', [GradeController::class, 'bulk']);
    
    Route::post('/students/bulk-delete', [StudentController::class, 'bulkDelete']);
    Route::post('/courses/bulk-delete', [CourseController::class, 'bulkDelete']);
    Route::get('/students/stats', [StudentController::class, 'stats']);
    Route::get('/students/ipk-average', [StudentController::class, 'ipkAverage']);
    Route::get('/grades/export/all', [GradeController::class, 'exportAll']);
    Route::get('/grades/student/{studentId}', [GradeController::class, 'byStudent']);
    
    // Resource routes
    Route::apiResource('departments', DepartmentController::class);
    Route::apiResource('students', StudentController::class);
    Route::apiResource('courses', CourseController::class);
    Route::apiResource('cpls', CplController::class);
    Route::apiResource('mappings', MappingController::class);
    Route::apiResource('grades', GradeController::class);
    
    // User admins compatibility
    Route::get('/user-admins', [AuthController::class, 'getAdmins']);
    Route::post('/user-admins', [AuthController::class, 'createAdmin']);
    Route::put('/user-admins/{id}', [AuthController::class, 'updateAdmin']);
    Route::delete('/user-admins/{id}', [AuthController::class, 'deleteAdmin']);
});
