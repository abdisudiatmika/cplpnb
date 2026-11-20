<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    private array $tables = ['courses', 'cpls', 'graduate_profiles'];

    public function up(): void
    {
        // Langkah-langkah dibuat aman untuk dijalankan ulang (DDL MySQL tidak transaksional).
        foreach ($this->tables as $table) {
            if (! Schema::hasColumn($table, 'curriculum_id')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->foreignUuid('curriculum_id')->nullable()->after('department_id')
                        ->constrained('curricula')->nullOnDelete();
                });
            }
        }

        // Semua data lama per prodi dimasukkan ke satu kurikulum awal yang menjadi kurikulum aktif.
        $now = now();
        foreach (DB::table('departments')->pluck('id') as $departmentId) {
            $curriculumId = DB::table('curricula')->where('department_id', $departmentId)->orderByDesc('is_default')->value('id');

            if (! $curriculumId) {
                $versions = DB::table('graduate_profiles')->where('department_id', $departmentId)->pluck('curriculum_version')
                    ->merge(DB::table('cpmks')->join('courses', 'courses.id', '=', 'cpmks.course_id')
                        ->where('courses.department_id', $departmentId)->pluck('cpmks.curriculum_version'))
                    ->filter()->unique()->values();
                $code = $versions->count() === 1 ? (string) $versions->first() : 'AWAL';
                $cohortFrom = DB::table('students')->where('department_id', $departmentId)->pluck('angkatan')
                    ->filter(fn ($year) => is_numeric($year))->map(fn ($year) => (int) $year)->min();

                $curriculumId = (string) Str::uuid();
                DB::table('curricula')->insert([
                    'id' => $curriculumId,
                    'department_id' => $departmentId,
                    'code' => $code,
                    'name' => $code === 'AWAL' ? 'Kurikulum Awal' : 'Kurikulum '.$code,
                    'cohort_from' => $cohortFrom,
                    'cohort_to' => null,
                    'status' => 'Aktif',
                    'is_default' => true,
                    'notes' => 'Dibuat otomatis dari data sebelum fitur kurikulum.',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            foreach ($this->tables as $table) {
                DB::table($table)->where('department_id', $departmentId)->whereNull('curriculum_id')
                    ->update(['curriculum_id' => $curriculumId]);
            }
        }

        // Indeks biasa untuk department_id agar foreign key tidak bergantung pada indeks unik lama (MySQL).
        $this->addIndexIfMissing('cpls', 'cpls_department_id_idx', ['department_id']);
        $this->addIndexIfMissing('graduate_profiles', 'graduate_profiles_department_id_idx', ['department_id']);

        // Kode CPL dan Profil Lulusan unik per kurikulum, sehingga kurikulum baru boleh memakai CPL-1 lagi.
        $this->dropIndexIfExists('cpls', 'cpls_department_code_unique');
        $this->addUniqueIfMissing('cpls', 'cpls_curriculum_code_unique', ['curriculum_id', 'code']);
        $this->dropIndexIfExists('graduate_profiles', 'graduate_profiles_department_id_curriculum_version_code_unique');
        $this->addUniqueIfMissing('graduate_profiles', 'graduate_profiles_curriculum_code_unique', ['curriculum_id', 'code']);
    }

    public function down(): void
    {
        $isSqlite = Schema::getConnection()->getDriverName() === 'sqlite';

        // Lepas foreign key lebih dulu agar indeks unik baru dapat dihapus (MySQL).
        if (! $isSqlite) {
            foreach ($this->tables as $table) {
                if (Schema::hasColumn($table, 'curriculum_id')) {
                    Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropForeign(['curriculum_id']));
                }
            }
        }

        $this->dropIndexIfExists('graduate_profiles', 'graduate_profiles_curriculum_code_unique');
        $this->addUniqueIfMissing('graduate_profiles', 'graduate_profiles_department_id_curriculum_version_code_unique', ['department_id', 'curriculum_version', 'code']);
        $this->dropIndexIfExists('cpls', 'cpls_curriculum_code_unique');
        $this->addUniqueIfMissing('cpls', 'cpls_department_code_unique', ['department_id', 'code']);

        foreach ($this->tables as $table) {
            if (Schema::hasColumn($table, 'curriculum_id')) {
                if (! $isSqlite) {
                    $this->dropIndexIfExists($table, $table.'_curriculum_id_foreign');
                }
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropColumn('curriculum_id'));
            }
        }
    }

    private function indexExists(string $table, string $index): bool
    {
        $connection = Schema::getConnection();
        if ($connection->getDriverName() === 'sqlite') {
            return collect($connection->select("PRAGMA index_list('{$table}')"))->contains(fn ($row) => $row->name === $index);
        }

        return collect($connection->select('SHOW INDEX FROM `'.$table.'`'))->contains(fn ($row) => $row->Key_name === $index);
    }

    private function addIndexIfMissing(string $table, string $index, array $columns): void
    {
        if (! $this->indexExists($table, $index)) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->index($columns, $index));
        }
    }

    private function addUniqueIfMissing(string $table, string $index, array $columns): void
    {
        if (! $this->indexExists($table, $index)) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->unique($columns, $index));
        }
    }

    private function dropIndexIfExists(string $table, string $index): void
    {
        if ($this->indexExists($table, $index)) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($index));
        }
    }
};
