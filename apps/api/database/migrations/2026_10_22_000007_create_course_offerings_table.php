<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_offerings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('course_id')->constrained('courses')->cascadeOnDelete();
            $table->foreignUuid('academic_class_id')->constrained('academic_classes')->cascadeOnDelete();
            $table->foreignUuid('academic_period_id')->constrained('academic_periods')->cascadeOnDelete();
            $table->enum('status', ['Draft', 'Aktif', 'Selesai'])->default('Draft');
            $table->timestamps();
            $table->unique(['course_id', 'academic_class_id', 'academic_period_id'], 'course_offering_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_offerings');
    }
};
