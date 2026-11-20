<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('grade_submissions', function (Blueprint $table) {
            $table->text('cpmk_analysis')->nullable()->after('reopen_reason');
        });
    }

    public function down(): void
    {
        Schema::table('grade_submissions', function (Blueprint $table) {
            $table->dropColumn('cpmk_analysis');
        });
    }
};
