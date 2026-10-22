<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('super_admin', 'admin_jurusan', 'dosen', 'user') NOT NULL DEFAULT 'admin_jurusan'");
            return;
        }

        if ($driver === 'sqlite') {
            $this->rebuildSqliteUsersTable(['super_admin', 'admin_jurusan', 'dosen', 'user']);
        }
    }

    public function down(): void
    {
        if (DB::table('users')->where('role', 'dosen')->exists()) {
            throw new RuntimeException('Role dosen masih digunakan. Hapus akun dosen sebelum rollback migration ini.');
        }

        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('super_admin', 'admin_jurusan', 'user') NOT NULL DEFAULT 'admin_jurusan'");
            return;
        }

        if ($driver === 'sqlite') {
            $this->rebuildSqliteUsersTable(['super_admin', 'admin_jurusan', 'user']);
        }
    }

    private function rebuildSqliteUsersTable(array $roles): void
    {
        $allowedRoles = collect($roles)
            ->map(fn (string $role) => "'" . str_replace("'", "''", $role) . "'")
            ->implode(', ');

        DB::statement('PRAGMA foreign_keys = OFF');

        try {
            DB::statement('DROP TABLE IF EXISTS users_role_migration');
            DB::statement(<<<SQL
                CREATE TABLE users_role_migration (
                    id varchar NOT NULL PRIMARY KEY,
                    name varchar NOT NULL,
                    email varchar NOT NULL,
                    email_verified_at datetime NULL,
                    password varchar NOT NULL,
                    image varchar NULL,
                    role varchar CHECK (role IN ({$allowedRoles})) NOT NULL DEFAULT 'admin_jurusan',
                    department_id varchar NULL,
                    remember_token varchar NULL,
                    created_at datetime NULL,
                    updated_at datetime NULL,
                    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
                )
            SQL);
            DB::statement('INSERT INTO users_role_migration SELECT id, name, email, email_verified_at, password, image, role, department_id, remember_token, created_at, updated_at FROM users');
            DB::statement('DROP TABLE users');
            DB::statement('ALTER TABLE users_role_migration RENAME TO users');
            DB::statement('CREATE UNIQUE INDEX users_email_unique ON users (email)');
        } finally {
            DB::statement('PRAGMA foreign_keys = ON');
        }
    }
};
