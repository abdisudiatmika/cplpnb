<?php

use App\Http\Controllers\AssessmentPlanController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CourseController;
use App\Http\Controllers\CplController;
use App\Http\Controllers\CpmkController;
use App\Http\Controllers\CurriculumController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\GradeController;
use App\Http\Controllers\GraduateProfileController;
use App\Http\Controllers\LecturerController;
use App\Http\Controllers\LecturerGradebookController;
use App\Http\Controllers\MappingController;
use App\Http\Controllers\ObeDashboardController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\TeachingAssignmentController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

// Endpoint yang dapat dipakai admin maupun dosen (otorisasi rinci ada di controller).
Route::middleware(['auth:sanctum', 'role:super_admin,admin_jurusan,dosen'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/me/password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');
    Route::get('/lecturers/me', [LecturerController::class, 'me']);
    Route::get('/teaching-assignments/me', [TeachingAssignmentController::class, 'me']);
    Route::get('/cpmks', [CpmkController::class, 'index']);
    Route::get('/cpmks/{cpmk}', [CpmkController::class, 'show']);
    Route::get('/assessment-plans', [AssessmentPlanController::class, 'index']);
    Route::get('/assessment-plans/{assessmentPlan}', [AssessmentPlanController::class, 'show']);
    Route::get('/lecturer-gradebooks', [LecturerGradebookController::class, 'index']);
    Route::get('/lecturer-gradebooks/{teachingAssignment}', [LecturerGradebookController::class, 'show']);
    Route::put('/lecturer-gradebooks/{teachingAssignment}/scores', [LecturerGradebookController::class, 'saveScores']);
    Route::put('/lecturer-gradebooks/{teachingAssignment}/analysis', [LecturerGradebookController::class, 'saveAnalysis']);
    Route::post('/lecturer-gradebooks/{teachingAssignment}/submit', [LecturerGradebookController::class, 'submit']);
});

// Endpoint khusus admin (Super Admin dan Admin Prodi).
Route::middleware(['auth:sanctum', 'role:super_admin,admin_jurusan'])->group(function () {
    Route::get('/report-settings', [DepartmentController::class, 'reportSettings']);
    Route::put('/report-settings', [DepartmentController::class, 'updateReportSettings']);

    // Frontend compatibility and custom routes MUST be before resource routes
    Route::get('/cpl/averages', [CplController::class, 'averages']);
    Route::get('/cpl/achievements-bulk', [CplController::class, 'achievementsBulk']);
    Route::get('/cpl/achievements/{id}', [CplController::class, 'achievements']);
    Route::get('/cpl/transcript/{id}', [CplController::class, 'transcript']);
    Route::get('/cpl/course-breakdown/{cplId}', [CplController::class, 'courseBreakdown']);
    Route::get('/cpl/course-summary', [CplController::class, 'courseSummary']);
    Route::get('/cpl', [CplController::class, 'index']);
    Route::post('/cpl', [CplController::class, 'store']);
    Route::put('/cpl/{id}', [CplController::class, 'update']);
    Route::delete('/cpl/{id}', [CplController::class, 'destroy']);

    // Bulk endpoints
    Route::post('/cpl/bulk', [CplController::class, 'bulk']);
    Route::post('/courses/bulk', [CourseController::class, 'bulk']);
    Route::get('/courses/mapping/{cplCode}', [CourseController::class, 'mapping']);
    Route::post('/mappings/bulk', [MappingController::class, 'bulk']);
    Route::post('/students/bulk', [StudentController::class, 'bulk']);
    Route::post('/grades/bulk', [GradeController::class, 'bulk']);

    Route::post('/students/bulk-delete', [StudentController::class, 'bulkDelete']);
    Route::post('/courses/bulk-delete', [CourseController::class, 'bulkDelete']);
    Route::get('/students/stats', [StudentController::class, 'stats']);
    Route::get('/students/ipk-average', [StudentController::class, 'ipkAverage']);
    Route::get('/students/{id}/academic-summary', [StudentController::class, 'academicSummary']);
    Route::get('/grades/periods', [GradeController::class, 'periods']);
    Route::get('/grades/export/all', [GradeController::class, 'exportAll']);
    Route::get('/grades/student/{studentId}', [GradeController::class, 'byStudent']);

    // Lecturer master data, CPMK, and teaching assignments.
    Route::apiResource('lecturers', LecturerController::class);
    Route::post('/cpmks/bulk', [CpmkController::class, 'bulk']);
    Route::apiResource('cpmks', CpmkController::class)->except(['index', 'show']);
    Route::apiResource('graduate-profiles', GraduateProfileController::class)->except(['show']);
    Route::get('/teaching-assignment-periods', [TeachingAssignmentController::class, 'periods']);
    Route::post('/teaching-assignment-periods/activate', [TeachingAssignmentController::class, 'activatePeriod']);
    Route::post('/teaching-assignment-periods/archive', [TeachingAssignmentController::class, 'archivePeriod']);
    Route::apiResource('teaching-assignments', TeachingAssignmentController::class)->except(['show']);
    Route::post('/assessment-plans/{assessmentPlan}/publish', [AssessmentPlanController::class, 'publish']);
    Route::apiResource('assessment-plans', AssessmentPlanController::class)
        ->parameters(['assessment-plans' => 'assessmentPlan'])
        ->except(['index', 'show']);
    Route::post('/lecturer-gradebooks/{teachingAssignment}/approve', [LecturerGradebookController::class, 'approve']);
    Route::post('/lecturer-gradebooks/{teachingAssignment}/lock', [LecturerGradebookController::class, 'lock']);
    Route::post('/lecturer-gradebooks/{teachingAssignment}/reopen', [LecturerGradebookController::class, 'reopen']);
    Route::post('/teaching-assignments/{teachingAssignment}/sync-enrollments', [LecturerGradebookController::class, 'syncEnrollments']);
    Route::get('/dashboard/obe-summary', [ObeDashboardController::class, 'summary']);

    // Kurikulum per prodi
    Route::get('/curricula', [CurriculumController::class, 'index']);
    Route::post('/curricula', [CurriculumController::class, 'store']);
    Route::put('/curricula/{curriculum}', [CurriculumController::class, 'update']);
    Route::post('/curricula/{curriculum}/activate', [CurriculumController::class, 'activate']);
    Route::delete('/curricula/{curriculum}', [CurriculumController::class, 'destroy']);

    // Resource routes
    Route::apiResource('departments', DepartmentController::class)->only(['index', 'show']);
    Route::apiResource('students', StudentController::class);
    Route::apiResource('courses', CourseController::class);
    Route::apiResource('cpls', CplController::class);
    Route::apiResource('mappings', MappingController::class);
    Route::apiResource('grades', GradeController::class);

    // Khusus Super Admin: kelola prodi dan akun admin prodi
    Route::middleware('role:super_admin')->group(function () {
        Route::apiResource('departments', DepartmentController::class)->only(['store', 'update', 'destroy']);
        Route::get('/user-admins', [AuthController::class, 'getAdmins']);
        Route::post('/user-admins', [AuthController::class, 'createAdmin']);
        Route::put('/user-admins/{id}', [AuthController::class, 'updateAdmin']);
        Route::delete('/user-admins/{id}', [AuthController::class, 'deleteAdmin']);
    });
});
