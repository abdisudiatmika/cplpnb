<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tabel lama di server produksi dibuat dengan charset latin1 (hasil impor/konversi awal),
 * sedangkan tabel baru Laravel memakai utf8mb4. MySQL/MariaDB menolak foreign key antar-charset
 * yang berbeda, sehingga tabel lama dikonversi ke utf8mb4_unicode_ci sebelum migrasi v2.
 *
 * MariaDB tidak mengizinkan perubahan charset pada kolom yang dipakai foreign key (meskipun
 * FOREIGN_KEY_CHECKS=0), maka foreign key yang menyentuh tabel yang dikonversi dicatat, dilepas,
 * lalu dipasang kembali dengan definisi yang sama setelah konversi.
 *
 * Hanya berjalan di MySQL/MariaDB dan aman dijalankan ulang (tabel yang sudah utf8mb4 dilewati).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        $schema = DB::getDatabaseName();
        $tables = collect(DB::select(
            "SELECT table_name AS name FROM information_schema.tables
             WHERE table_schema = ? AND table_type = 'BASE TABLE' AND table_collation <> 'utf8mb4_unicode_ci'",
            [$schema]
        ))->pluck('name')->values();

        if ($tables->isEmpty()) {
            return;
        }

        $foreignKeys = $this->foreignKeysTouching($schema, $tables->all());

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($foreignKeys as $fk) {
                DB::statement("ALTER TABLE `{$fk['table']}` DROP FOREIGN KEY `{$fk['name']}`");
            }

            foreach ($tables as $table) {
                DB::statement("ALTER TABLE `{$table}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }

            foreach ($foreignKeys as $fk) {
                $columns = collect($fk['columns'])->map(fn ($column) => "`{$column}`")->join(', ');
                $referenced = collect($fk['referenced_columns'])->map(fn ($column) => "`{$column}`")->join(', ');
                DB::statement(
                    "ALTER TABLE `{$fk['table']}` ADD CONSTRAINT `{$fk['name']}` FOREIGN KEY ({$columns}) "
                    ."REFERENCES `{$fk['referenced_table']}` ({$referenced}) ON DELETE {$fk['delete_rule']} ON UPDATE {$fk['update_rule']}"
                );
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }
    }

    public function down(): void
    {
        // Tidak dikembalikan ke latin1: utf8mb4 mencakup seluruh karakter latin1.
    }

    /**
     * Foreign key yang tabel asal atau tabel rujukannya termasuk tabel yang akan dikonversi.
     */
    private function foreignKeysTouching(string $schema, array $tables): array
    {
        $rows = DB::select(
            "SELECT rc.constraint_name AS name, rc.table_name AS tbl, rc.referenced_table_name AS ref_tbl,
                    rc.update_rule AS update_rule, rc.delete_rule AS delete_rule, k.column_name AS col, k.referenced_column_name AS ref_col,
                    k.ordinal_position AS pos
             FROM information_schema.referential_constraints rc
             JOIN information_schema.key_column_usage k
               ON k.constraint_schema = rc.constraint_schema
              AND k.constraint_name = rc.constraint_name
              AND k.table_name = rc.table_name
             WHERE rc.constraint_schema = ?
             ORDER BY rc.table_name, rc.constraint_name, k.ordinal_position",
            [$schema]
        );

        return collect($rows)
            ->groupBy(fn ($row) => $row->tbl.'|'.$row->name)
            ->map(fn ($group) => [
                'name' => $group->first()->name,
                'table' => $group->first()->tbl,
                'referenced_table' => $group->first()->ref_tbl,
                'update_rule' => $group->first()->update_rule,
                'delete_rule' => $group->first()->delete_rule,
                'columns' => $group->sortBy('pos')->pluck('col')->all(),
                'referenced_columns' => $group->sortBy('pos')->pluck('ref_col')->all(),
            ])
            ->filter(fn ($fk) => in_array($fk['table'], $tables, true) || in_array($fk['referenced_table'], $tables, true))
            ->values()
            ->all();
    }
};
