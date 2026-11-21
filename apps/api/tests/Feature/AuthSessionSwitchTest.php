<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuthSessionSwitchTest extends TestCase
{
    use RefreshDatabase;

    public function test_logout_then_login_as_another_user_keeps_new_session_valid(): void
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $first = $this->user('super_admin', null, 'super-switch@example.test');
        $second = $this->user('admin_jurusan', $department->id, 'admin-switch@example.test');

        $this->withHeaders(['Referer' => 'http://localhost/', 'Origin' => 'http://localhost']);

        $this->fresh()->postJson('/api/login', ['email' => $first->email, 'password' => 'password123'])->assertOk();
        $this->fresh()->getJson('/api/me')->assertOk()->assertJsonPath('user.email', $first->email);
        $this->fresh()->postJson('/api/logout')->assertOk();

        $this->fresh()->postJson('/api/login', ['email' => $second->email, 'password' => 'password123'])->assertOk();
        $this->fresh()->getJson('/api/me')->assertOk()->assertJsonPath('user.email', $second->email);
    }

    /**
     * Setiap request HTTP asli memulai state auth yang bersih; di PHPUnit aplikasi dipakai ulang,
     * jadi guard default (yang diganti middleware auth:sanctum) dikembalikan ke "web".
     */
    private function fresh(): static
    {
        config(['auth.defaults.guard' => 'web']);
        $this->app['auth']->forgetGuards();

        return $this;
    }

    private function user(string $role, ?string $departmentId, string $email): User
    {
        return User::create([
            'id' => (string) Str::uuid(),
            'name' => $email,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'department_id' => $departmentId,
        ]);
    }
}
