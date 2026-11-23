<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nilai per CPMK yang diinput admin prodi (di luar buku nilai dosen), misalnya untuk
 * data historis. Satu mahasiswa memiliki paling banyak satu nilai per CPMK.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_cpmk_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('student_id')->constrained('students')->cascadeOnDelete();
            $table->foreignUuid('course_id')->constrained('courses')->cascadeOnDelete();
            $table->foreignUuid('cpmk_id')->constrained('cpmks')->cascadeOnDelete();
            $table->decimal('score', 5, 2);
            $table->string('semester', 50)->nullable();
            $table->string('academic_year', 50)->nullable();
            $table->uuid('input_by')->nullable();
            $table->timestamps();

            $table->unique(['student_id', 'cpmk_id']);
            $table->index(['course_id', 'student_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_cpmk_scores');
    }
};
