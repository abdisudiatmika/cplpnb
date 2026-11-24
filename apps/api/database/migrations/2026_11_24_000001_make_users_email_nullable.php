<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Email akun boleh kosong agar dosen hasil impor data kepegawaian (tanpa email) tetap dapat
 * dibuat dan login memakai NIP/NUPTK. Indeks unik email tetap ada (NULL boleh lebih dari satu).
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->setEmailNullable(true);
    }

    public function down(): void
    {
        if (DB::table('users')->whereNull('email')->exists()) {
            throw new RuntimeException('Masih ada akun tanpa email. Lengkapi email sebelum rollback migration ini.');
        }
        $this->setEmailNullable(false);
    }

    private function setEmailNullable(bool $nullable): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement('ALTER TABLE users MODIFY email VARCHAR(255) '.($nullable ? 'NULL' : 'NOT NULL'));

            return;
        }

        if ($driver === 'sqlite') {
            $sql = DB::selectOne("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")->sql;
            $pattern = $nullable ? '/(\bemail\b"?\s+varchar)\s+NOT NULL/i' : '/(\bemail\b"?\s+varchar)\s+NULL/i';
            $updated = preg_replace($pattern, $nullable ? '$1 NULL' : '$1 NOT NULL', $sql, 1, $count);
            if ($count !== 1) {
                throw new RuntimeException('Definisi kolom email pada tabel users tidak dikenali.');
            }
            $indexes = collect(DB::select("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users' AND sql IS NOT NULL"))->pluck('sql');
            $columns = collect(DB::select('PRAGMA table_info(users)'))->pluck('name')->map(fn ($name) => '"'.$name.'"')->implode(', ');

            DB::statement('PRAGMA foreign_keys = OFF');
            try {
                DB::statement('DROP TABLE IF EXISTS users_email_migration');
                DB::statement(preg_replace('/CREATE TABLE\s+"?users"?/i', 'CREATE TABLE users_email_migration', $updated, 1));
                DB::statement("INSERT INTO users_email_migration ({$columns}) SELECT {$columns} FROM users");
                DB::statement('DROP TABLE users');
                DB::statement('ALTER TABLE users_email_migration RENAME TO users');
                foreach ($indexes as $index) {
                    DB::statement($index);
                }
            } finally {
                DB::statement('PRAGMA foreign_keys = ON');
            }
        }
    }
};
