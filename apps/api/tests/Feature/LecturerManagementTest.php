<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Lecturer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class LecturerManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_department_admin_can_create_and_list_lecturer_in_own_department(): void
    {
        $department = $this->department('AK', 'Akuntansi');
        $admin = $this->user('admin_jurusan', $department->id, 'admin@example.test');

        $response = $this->actingAs($admin)->postJson('/api/lecturers', [
            'name' => 'Dosen Satu',
            'email' => 'dosen1@example.test',
            'password' => 'password123',
            'employee_number' => 'NIP-001',
            'departmentId' => 'department-lain-yang-diabaikan',
        ]);

        $response->assertCreated()
            ->assertJsonPath('name', 'Dosen Satu')
            ->assertJsonPath('departmentId', $department->id)
            ->assertJsonPath('employeeNumber', 'NIP-001');

        $this->assertDatabaseHas('users', [
            'email' => 'dosen1@example.test',
            'role' => 'dosen',
            'department_id' => $department->id,
        ]);
        $this->assertDatabaseHas('lecturers', [
            'employee_number' => 'NIP-001',
            'department_id' => $department->id,
            'status' => 'Aktif',
        ]);

        $this->actingAs($admin)->getJson('/api/lecturers')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.email', 'dosen1@example.test');
    }

    public function test_department_admin_cannot_access_lecturer_from_other_department(): void
    {
        $departmentA = $this->department('AK', 'Akuntansi');
        $departmentB = $this->department('PN', 'Pariwisata');
        $adminA = $this->user('admin_jurusan', $departmentA->id, 'admin-a@example.test');
        $lecturerUser = $this->user('dosen', $departmentB->id, 'dosen-b@example.test');
        $lecturer = Lecturer::create([
            'user_id' => $lecturerUser->id,
            'department_id' => $departmentB->id,
            'employee_number' => 'NIP-B',
            'status' => 'Aktif',
        ]);

        $this->actingAs($adminA)->getJson('/api/lecturers/' . $lecturer->id)
            ->assertForbidden();
        $this->actingAs($adminA)->putJson('/api/lecturers/' . $lecturer->id, [
            'name' => 'Tidak Boleh Diubah',
        ])->assertForbidden();
        $this->actingAs($adminA)->deleteJson('/api/lecturers/' . $lecturer->id)
            ->assertForbidden();
    }

    public function test_lecturer_can_read_own_profile_but_cannot_list_all_lecturers(): void
    {
        $department = $this->department('AK', 'Akuntansi');
        $lecturerUser = $this->user('dosen', $department->id, 'dosen@example.test');
        $lecturer = Lecturer::create([
            'user_id' => $lecturerUser->id,
            'department_id' => $department->id,
            'employee_number' => 'NIP-002',
            'status' => 'Aktif',
        ]);

        $this->actingAs($lecturerUser)->getJson('/api/lecturers/me')
            ->assertOk()
            ->assertJsonPath('id', $lecturer->id)
            ->assertJsonPath('employeeNumber', 'NIP-002');

        $this->actingAs($lecturerUser)->getJson('/api/lecturers')
            ->assertForbidden();
    }

    public function test_inactive_lecturer_cannot_login(): void
    {
        $department = $this->department('AK', 'Akuntansi');
        $lecturerUser = $this->user('dosen', $department->id, 'inactive@example.test');
        Lecturer::create([
            'user_id' => $lecturerUser->id,
            'department_id' => $department->id,
            'employee_number' => 'NIP-003',
            'status' => 'Nonaktif',
        ]);

        $this->withSession([])->postJson('/api/login', [
            'email' => 'inactive@example.test',
            'password' => 'password123',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    private function department(string $code, string $name): Department
    {
        return Department::create([
            'id' => (string) Str::uuid(),
            'code' => $code,
            'name' => $name,
        ]);
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
