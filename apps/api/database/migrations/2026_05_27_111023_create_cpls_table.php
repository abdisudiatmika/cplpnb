<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('cpls', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code'); // e.g. "CPL-01"
            $table->text('description');
            $table->enum('category', ['Sikap', 'Pengetahuan', 'Keterampilan Umum', 'Keterampilan Khusus']);
            $table->integer('target_value')->default(75);
            $table->foreignUuid('department_id')->constrained('departments')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cpls');
    }
};
