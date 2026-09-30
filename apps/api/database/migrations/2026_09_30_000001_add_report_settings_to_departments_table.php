<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->string('head_name')->nullable()->after('code');
            $table->string('head_nip', 100)->nullable()->after('head_name');
            $table->longText('signature_data')->nullable()->after('head_nip');
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropColumn(['head_name', 'head_nip', 'signature_data']);
        });
    }
};
