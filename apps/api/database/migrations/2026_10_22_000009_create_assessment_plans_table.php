<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assessment_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('course_offering_id')->constrained('course_offerings')->cascadeOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->enum('status', ['Draft', 'Published', 'Archived'])->default('Draft');
            $table->foreignUuid('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->unique(['course_offering_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assessment_plans');
    }
};
