<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cpmk_cpl_mappings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('cpmk_id')->constrained('cpmks')->cascadeOnDelete();
            $table->foreignUuid('cpl_id')->constrained('cpls')->cascadeOnDelete();
            $table->decimal('contribution_weight', 5, 2)->default(100);
            $table->timestamps();

            $table->unique(['cpmk_id', 'cpl_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cpmk_cpl_mappings');
    }
};
