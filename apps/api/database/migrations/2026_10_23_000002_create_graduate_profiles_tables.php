<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('graduate_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('department_id')->constrained()->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name');
            $table->string('english_name')->nullable();
            $table->text('summary');
            $table->string('curriculum_version', 20)->default('2026');
            $table->string('status', 20)->default('Aktif');
            $table->unsignedSmallInteger('sequence')->default(1);
            $table->timestamps();
            $table->unique(['department_id', 'curriculum_version', 'code']);
        });

        Schema::create('graduate_profile_cpl', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('graduate_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('cpl_id')->constrained()->cascadeOnDelete();
            $table->string('contribution_type', 20);
            $table->timestamps();
            $table->unique(['graduate_profile_id', 'cpl_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('graduate_profile_cpl');
        Schema::dropIfExists('graduate_profiles');
    }
};
