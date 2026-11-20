<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, ?string $departmentId = null): User
    {
        return User::create([
            'id' => (string) Str::uuid(),
            'name' => ucfirst($role),
            'email' => $role.Str::random(5).'@example.test',
            'password' => Hash::make('rahasia-panjang'),
            'role' => $role,
            'department_id' => $departmentId,
        ]);
    }

    public function test_dangerous_public_routes_are_removed(): void
    {
        $this->getJson('/api/reset-superadmin')->assertNotFound();
        $this->getJson('/api/debug-auth')->assertNotFound();
        $this->postJson('/api/register', [
            'name' => 'Penyusup',
            'email' => 'penyusup@example.test',
            'password' => 'password123',
        ])->assertNotFound();
        $this->assertDatabaseMissing('users', ['email' => 'penyusup@example.test']);
    }

    public function test_user_role_cannot_access_api(): void
    {
        Sanctum::actingAs($this->makeUser('user'));

        $this->getJson('/api/students')->assertForbidden();
        $this->getJson('/api/user-admins')->assertForbidden();
    }

    public function test_lecturer_cannot_access_admin_endpoints(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        Sanctum::actingAs($this->makeUser('dosen', $department->id));

        $this->getJson('/api/me')->assertOk();
        foreach (['/api/students', '/api/grades', '/api/courses', '/api/cpl', '/api/lecturers', '/api/teaching-assignments', '/api/user-admins'] as $url) {
            $this->getJson($url)->assertForbidden();
        }
        $this->postJson('/api/grades/bulk', ['items' => []])->assertForbidden();
        $this->postJson('/api/cpmks', [])->assertForbidden();
    }

    public function test_department_admin_cannot_manage_admins_or_departments(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        $superAdmin = $this->makeUser('super_admin');
        Sanctum::actingAs($this->makeUser('admin_jurusan', $department->id));

        $this->getJson('/api/departments')->assertOk();
        $this->getJson('/api/user-admins')->assertForbidden();
        $this->putJson('/api/user-admins/'.$superAdmin->id, ['password' => 'diambilalih1'])->assertForbidden();
        $this->deleteJson('/api/departments/'.$department->id)->assertForbidden();
        $this->postJson('/api/departments', ['name' => 'Baru', 'code' => 'BR'])->assertForbidden();

        $this->assertTrue(Hash::check('rahasia-panjang', $superAdmin->fresh()->password));
    }

    public function test_super_admin_manages_admins_but_not_other_super_admins(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        $admin = $this->makeUser('admin_jurusan', $department->id);
        $otherSuper = $this->makeUser('super_admin');
        Sanctum::actingAs($this->makeUser('super_admin'));

        $this->getJson('/api/user-admins')->assertOk();
        $this->putJson('/api/user-admins/'.$admin->id, ['name' => 'Admin AK'])->assertOk();
        $this->putJson('/api/user-admins/'.$otherSuper->id, ['password' => 'diambilalih1'])->assertNotFound();
        $this->postJson('/api/departments', ['name' => 'Baru', 'code' => 'BR'])->assertSuccessful();
    }

    public function test_user_can_change_own_password_with_current_password(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        $admin = $this->makeUser('admin_jurusan', $department->id);
        Sanctum::actingAs($admin);

        $this->putJson('/api/me/password', ['currentPassword' => 'salah', 'password' => 'KataSandiBaru#2026', 'password_confirmation' => 'KataSandiBaru#2026'])
            ->assertStatus(422)->assertJsonValidationErrors('currentPassword');
        $this->putJson('/api/me/password', ['currentPassword' => 'rahasia-panjang', 'password' => 'pendek', 'password_confirmation' => 'pendek'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->putJson('/api/me/password', ['currentPassword' => 'rahasia-panjang', 'password' => 'KataSandiBaru#2026', 'password_confirmation' => 'KataSandiBaru#2026'])
            ->assertOk();

        $this->assertTrue(Hash::check('KataSandiBaru#2026', $admin->fresh()->password));
    }

    public function test_lecturer_can_also_change_password(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        Sanctum::actingAs($this->makeUser('dosen', $department->id));

        $this->putJson('/api/me/password', ['currentPassword' => 'rahasia-panjang', 'password' => 'KataSandiDosen#2026', 'password_confirmation' => 'KataSandiDosen#2026'])
            ->assertOk();
    }
}
