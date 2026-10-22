<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teaching_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('course_offering_id')->constrained('course_offerings')->cascadeOnDelete();
            $table->foreignUuid('lecturer_id')->constrained('lecturers')->cascadeOnDelete();
            $table->enum('role', ['coordinator', 'member'])->default('member');
            $table->enum('status', ['Aktif', 'Nonaktif'])->default('Aktif');
            $table->foreignUuid('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['course_offering_id', 'lecturer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teaching_assignments');
    }
};
