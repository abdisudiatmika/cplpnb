<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_assessment_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('course_enrollment_id')->constrained('course_enrollments')->cascadeOnDelete();
            $table->foreignUuid('assessment_item_id')->constrained('assessment_items')->cascadeOnDelete();
            $table->decimal('score', 5, 2)->nullable();
            $table->enum('eligibility_status', ['eligible', 'not_eligible_attendance', 'excused', 'absent', 'makeup_exam'])->default('eligible');
            $table->text('note')->nullable();
            $table->foreignUuid('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('entered_at')->nullable();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['course_enrollment_id', 'assessment_item_id'], 'student_assessment_score_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_assessment_scores');
    }
};
