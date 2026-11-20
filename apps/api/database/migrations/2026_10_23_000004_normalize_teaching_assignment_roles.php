<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('teaching_assignments')) {
            DB::table('teaching_assignments')->where('role', 'coordinator')->update(['role' => 'member']);
        }
    }

    public function down(): void
    {
        // Assignment roles cannot be inferred after they are normalized.
    }
};
