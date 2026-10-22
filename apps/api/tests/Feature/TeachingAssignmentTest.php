<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Department;
use App\Models\Lecturer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class TeachingAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_assigns_lecturer_to_course_class_and_period(): void
    {
        [$department, $admin, $lecturer, $course] = $this->context();

        $response = $this->actingAs($admin)->postJson('/api/teaching-assignments', [
            'lecturerId' => $lecturer->id,
            'courseId' => $course->id,
            'className' => 'A',
            'cohortYear' => 2025,
            'academicYear' => '2025/2026',
            'semester' => 'Ganjil',
            'role' => 'coordinator',
        ]);

        $response->assertCreated()
            ->assertJsonPath('lecturerName', 'Dosen Satu')
            ->assertJsonPath('courseCode', 'MPK2462401101')
            ->assertJsonPath('className', 'A')
            ->assertJsonPath('academicYear', '2025/2026')
            ->assertJsonPath('role', 'coordinator');

        $this->assertDatabaseCount('academic_periods', 1);
        $this->assertDatabaseCount('academic_classes', 1);
        $this->assertDatabaseCount('course_offerings', 1);
        $this->assertDatabaseCount('teaching_assignments', 1);
    }

    public function test_duplicate_assignment_is_rejected_and_reuses_academic_structure(): void
    {
        [$department, $admin, $lecturer, $course] = $this->context();
        $payload = [
            'lecturerId' => $lecturer->id,
            'courseId' => $course->id,
            'className' => 'A',
            'cohortYear' => 2025,
            'academicYear' => '2025/2026',
            'semester' => 'Ganjil',
            'role' => 'member',
        ];

        $this->actingAs($admin)->postJson('/api/teaching-assignments', $payload)->assertCreated();
        $this->actingAs($admin)->postJson('/api/teaching-assignments', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('lecturerId');

        $this->assertDatabaseCount('academic_periods', 1);
        $this->assertDatabaseCount('academic_classes', 1);
        $this->assertDatabaseCount('course_offerings', 1);
        $this->assertDatabaseCount('teaching_assignments', 1);
    }

    public function test_department_admin_cannot_assign_lecturer_or_course_from_other_department(): void
    {
        [$departmentA, $adminA] = $this->context();
        [$departmentB, $adminB, $lecturerB, $courseB] = $this->context('PN', 'Pariwisata', 'admin-b@example.test');

        $this->actingAs($adminA)->postJson('/api/teaching-assignments', [
            'lecturerId' => $lecturerB->id,
            'courseId' => $courseB->id,
            'className' => 'A',
            'cohortYear' => 2025,
            'academicYear' => '2025/2026',
            'semester' => 'Ganjil',
        ])->assertNotFound();

        $this->assertDatabaseCount('teaching_assignments', 0);
    }

    public function test_lecturer_only_sees_own_active_assignments(): void
    {
        [$department, $admin, $lecturer, $course, $lecturerUser] = $this->context();
        $this->actingAs($admin)->postJson('/api/teaching-assignments', [
            'lecturerId' => $lecturer->id,
            'courseId' => $course->id,
            'className' => 'B',
            'cohortYear' => 2024,
            'academicYear' => '2025/2026',
            'semester' => 'Genap',
            'role' => 'coordinator',
        ])->assertCreated();

        $this->actingAs($lecturerUser)->getJson('/api/teaching-assignments/me')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.courseName', 'Pendidikan Pancasila')
            ->assertJsonPath('0.className', 'B');

        $this->actingAs($lecturerUser)->getJson('/api/teaching-assignments')->assertForbidden();
    }

    private function context(string $code = 'AK', string $name = 'Akuntansi', string $adminEmail = 'admin@example.test'): array
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => $code, 'name' => $name]);
        $admin = $this->user('admin_jurusan', $department->id, $adminEmail, 'Admin');
        $lecturerUser = $this->user('dosen', $department->id, 'dosen-' . strtolower($code) . '@example.test', 'Dosen Satu');
        $lecturer = Lecturer::create([
            'user_id' => $lecturerUser->id,
            'department_id' => $department->id,
            'employee_number' => 'NIP-' . $code,
            'status' => 'Aktif',
        ]);
        $course = Course::create([
            'id' => (string) Str::uuid(),
            'department_id' => $department->id,
            'code' => $code === 'AK' ? 'MPK2462401101' : 'MK-' . $code,
            'name' => $code === 'AK' ? 'Pendidikan Pancasila' : 'Mata Kuliah ' . $name,
            'sks' => 2,
            'semester' => 1,
        ]);

        return [$department, $admin, $lecturer, $course, $lecturerUser];
    }

    private function user(string $role, string $departmentId, string $email, string $name): User
    {
        return User::create([
            'id' => (string) Str::uuid(),
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'department_id' => $departmentId,
        ]);
    }
}
