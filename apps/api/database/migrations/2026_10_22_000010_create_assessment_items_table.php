<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assessment_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('assessment_plan_id')->constrained('assessment_plans')->cascadeOnDelete();
            $table->foreignUuid('cpmk_id')->constrained('cpmks')->restrictOnDelete();
            $table->enum('category', ['assignment', 'quiz', 'midterm', 'final', 'project', 'practice', 'presentation', 'other']);
            $table->string('name', 150);
            $table->decimal('weight', 5, 2);
            $table->unsignedSmallInteger('sequence')->default(1);
            $table->boolean('is_required')->default(true);
            $table->timestamps();
            $table->unique(['assessment_plan_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assessment_items');
    }
};
