<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tabel lama di server produksi dibuat dengan charset latin1 (hasil impor/konversi awal),
 * sedangkan tabel baru Laravel memakai utf8mb4. MySQL menolak foreign key antar-charset
 * yang berbeda, sehingga tabel lama dikonversi ke utf8mb4_unicode_ci sebelum migrasi v2.
 * Hanya berjalan di MySQL/MariaDB dan aman dijalankan ulang (tabel yang sudah utf8mb4 dilewati).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        $tables = collect(DB::select(
            "SELECT table_name AS name FROM information_schema.tables
             WHERE table_schema = ? AND table_type = 'BASE TABLE' AND table_collation <> 'utf8mb4_unicode_ci'",
            [DB::getDatabaseName()]
        ))->pluck('name');

        if ($tables->isEmpty()) {
            return;
        }

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($tables as $table) {
                DB::statement("ALTER TABLE `{$table}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }
    }

    public function down(): void
    {
        // Tidak dikembalikan ke latin1: utf8mb4 mencakup seluruh karakter latin1.
    }
};
