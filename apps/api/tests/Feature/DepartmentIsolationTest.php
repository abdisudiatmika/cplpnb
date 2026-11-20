<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Department;
use App\Models\Student;
use App\Models\StudentGrade;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepartmentIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Department $mine;
    private Department $other;
    private array $theirs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mine = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        $this->other = Department::create(['name' => 'D2 Administrasi Pajak', 'code' => 'AP']);
        $this->theirs = $this->seedDepartment($this->other, 'X');

        Sanctum::actingAs(User::create([
            'id' => (string) Str::uuid(),
            'name' => 'Admin AK',
            'email' => 'admin.ak@example.test',
            'password' => Hash::make('rahasia-panjang'),
            'role' => 'admin_jurusan',
            'department_id' => $this->mine->id,
        ]));
    }

    private function seedDepartment(Department $department, string $suffix): array
    {
        $student = Student::create(['id' => (string) Str::uuid(), 'nim' => 'NIM'.$suffix, 'name' => 'Mhs '.$suffix, 'angkatan' => '2024', 'kelas' => 'A', 'status' => 'Aktif', 'department_id' => $department->id]);
        $course = Course::create(['id' => (string) Str::uuid(), 'code' => 'MK'.$suffix, 'name' => 'MK '.$suffix, 'sks' => 2, 'department_id' => $department->id]);
        $cpl = Cpl::create(['id' => (string) Str::uuid(), 'code' => 'CPL-1', 'description' => 'CPL '.$suffix, 'target_value' => 75, 'department_id' => $department->id]);
        $mapping = CourseCplMapping::create(['id' => (string) Str::uuid(), 'course_id' => $course->id, 'cpl_id' => $cpl->id, 'weight' => 1]);
        $grade = StudentGrade::create(['id' => (string) Str::uuid(), 'student_id' => $student->id, 'course_id' => $course->id, 'grade' => 'A', 'score' => 90, 'semester' => '1', 'academic_year' => '2024/2025']);

        return compact('student', 'course', 'cpl', 'mapping', 'grade');
    }

    public function test_admin_cannot_read_change_or_delete_other_department_records(): void
    {
        $routes = [
            'students' => $this->theirs['student'],
            'courses' => $this->theirs['course'],
            'cpls' => $this->theirs['cpl'],
            'mappings' => $this->theirs['mapping'],
            'grades' => $this->theirs['grade'],
        ];

        foreach ($routes as $resource => $model) {
            $this->getJson("/api/$resource/{$model->id}")->assertNotFound();
            $this->putJson("/api/$resource/{$model->id}", ['name' => 'Diubah', 'weight' => 5, 'score' => 1])->assertNotFound();
            $this->deleteJson("/api/$resource/{$model->id}")->assertNotFound();
        }

        $this->getJson("/api/departments/{$this->other->id}")->assertNotFound();
        $this->assertSame([$this->mine->id], collect($this->getJson('/api/departments')->assertOk()->json())->pluck('id')->all());

        $this->assertDatabaseHas('students', ['id' => $this->theirs['student']->id, 'name' => 'Mhs X']);
        $this->assertDatabaseHas('student_grades', ['id' => $this->theirs['grade']->id, 'score' => 90]);
        $this->assertDatabaseHas('course_cpl_mappings', ['id' => $this->theirs['mapping']->id]);
    }

    public function test_admin_cannot_create_records_in_or_pointing_to_other_department(): void
    {
        $this->postJson('/api/students', [
            'nim' => 'NIMBARU', 'name' => 'Baru', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif',
            'departmentId' => $this->other->id,
        ])->assertCreated()->assertJsonPath('department_id', $this->mine->id);

        $this->postJson('/api/grades', [
            'studentId' => $this->theirs['student']->id, 'courseId' => $this->theirs['course']->id,
            'grade' => 'E', 'score' => 0, 'semester' => '1', 'academicYear' => '2024/2025',
        ])->assertForbidden();

        $this->postJson('/api/grades/bulk', ['items' => [[
            'studentId' => $this->theirs['student']->id, 'courseId' => $this->theirs['course']->id, 'grade' => 'E', 'score' => 0,
        ]]])->assertForbidden();

        $this->postJson('/api/mappings', [
            'courseId' => $this->theirs['course']->id, 'cplId' => $this->theirs['cpl']->id, 'weight' => 9,
        ])->assertForbidden();

        $this->assertDatabaseHas('student_grades', ['id' => $this->theirs['grade']->id, 'grade' => 'A', 'score' => 90]);
    }

    public function test_admin_can_still_manage_own_department(): void
    {
        $own = $this->seedDepartment($this->mine, 'A');

        $this->getJson("/api/students/{$own['student']->id}")->assertOk();
        $this->putJson("/api/students/{$own['student']->id}", ['name' => 'Nama Baru'])->assertOk();
        $this->putJson("/api/grades/{$own['grade']->id}", ['score' => 88])->assertOk();
        $this->putJson("/api/mappings/{$own['mapping']->id}", ['weight' => 2])->assertOk();
        $this->postJson('/api/grades/bulk', ['items' => [[
            'studentId' => $own['student']->id, 'courseId' => $own['course']->id, 'grade' => 'AB', 'score' => 78,
        ]]])->assertOk();
        $this->deleteJson("/api/cpls/{$own['cpl']->id}")->assertNoContent();

        $this->assertDatabaseHas('students', ['id' => $own['student']->id, 'name' => 'Nama Baru']);
        $this->assertDatabaseHas('student_grades', ['id' => $own['grade']->id, 'grade' => 'AB', 'score' => 78]);
    }
}
