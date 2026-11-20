<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Curriculum;
use App\Models\Department;
use App\Models\GraduateProfile;
use App\Models\GraduateProfileCpl;
use App\Models\Student;
use App\Models\StudentGrade;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CurriculumTest extends TestCase
{
    use RefreshDatabase;

    private Department $department;
    private Curriculum $old;

    protected function setUp(): void
    {
        parent::setUp();
        $this->department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        $this->old = Curriculum::create(['department_id' => $this->department->id, 'code' => '2020', 'name' => 'Kurikulum 2020', 'cohort_from' => 2020, 'cohort_to' => 2023, 'is_default' => true]);

        $course = Course::create(['code' => 'AK101', 'name' => 'Pengantar Akuntansi', 'sks' => 3, 'semester' => 1, 'department_id' => $this->department->id, 'curriculum_id' => $this->old->id]);
        $cpl = Cpl::create(['code' => 'CPL-1', 'description' => 'CPL lama', 'target_value' => 75, 'department_id' => $this->department->id, 'curriculum_id' => $this->old->id]);
        CourseCplMapping::create(['course_id' => $course->id, 'cpl_id' => $cpl->id, 'weight' => 1]);
        $profile = GraduateProfile::create(['department_id' => $this->department->id, 'curriculum_id' => $this->old->id, 'code' => 'PL-1', 'name' => 'Akuntan', 'summary' => 'Profil', 'curriculum_version' => '2020', 'status' => 'Aktif', 'sequence' => 1]);
        GraduateProfileCpl::create(['graduate_profile_id' => $profile->id, 'cpl_id' => $cpl->id, 'contribution_type' => 'core']);

        Sanctum::actingAs(User::create([
            'id' => (string) Str::uuid(), 'name' => 'Admin AK', 'email' => 'admin.ak@example.test',
            'password' => Hash::make('rahasia-panjang'), 'role' => 'admin_jurusan', 'department_id' => $this->department->id,
        ]));
    }

    private function createNewCurriculum(): string
    {
        return $this->postJson('/api/curricula', [
            'code' => '2024', 'name' => 'Kurikulum 2024', 'cohortFrom' => 2024, 'copyFromId' => $this->old->id,
        ])->assertCreated()
            ->assertJsonPath('isDefault', false)
            ->assertJsonPath('coursesCount', 1)
            ->assertJsonPath('cplsCount', 1)
            ->assertJsonPath('graduateProfilesCount', 1)
            ->json('id');
    }

    public function test_new_curriculum_copies_structure_and_lists_are_scoped_by_selected_curriculum(): void
    {
        $newId = $this->createNewCurriculum();

        // Tanpa header: memakai kurikulum aktif (lama).
        $this->getJson('/api/courses')->assertOk()->assertJsonCount(1)->assertJsonPath('0.curriculum_id', $this->old->id);

        // Dengan header: data kurikulum baru, terpisah dari yang lama.
        $headers = ['X-Curriculum-Id' => $newId];
        $this->getJson('/api/courses', $headers)->assertOk()->assertJsonCount(1)->assertJsonPath('0.curriculum_id', $newId);
        $this->getJson('/api/cpl', $headers)->assertOk()->assertJsonCount(1)->assertJsonPath('0.curriculum_id', $newId);
        $this->getJson('/api/graduate-profiles', $headers)->assertOk()->assertJsonCount(1);
        $this->getJson('/api/mappings', $headers)->assertOk()->assertJsonCount(1);

        // Kode CPL boleh sama di kurikulum berbeda, tetapi tidak boleh ganda dalam satu kurikulum.
        $this->postJson('/api/cpl', ['code' => 'CPL-2', 'description' => 'CPL baru'], $headers)->assertCreated()->assertJsonPath('curriculum_id', $newId);
        $this->postJson('/api/cpl', ['code' => 'CPL-2', 'description' => 'Duplikat'], $headers)->assertStatus(422);
        $this->postJson('/api/cpl', ['code' => 'CPL-2', 'description' => 'CPL-2 untuk kurikulum lama'])->assertCreated()->assertJsonPath('curriculum_id', $this->old->id);

        // MK baru ikut kurikulum yang dipilih.
        $this->postJson('/api/courses', ['code' => 'AK201', 'name' => 'Akuntansi Digital', 'sks' => 2], $headers)->assertCreated()->assertJsonPath('curriculum_id', $newId);
        $this->assertSame(1, Course::where('curriculum_id', $this->old->id)->count());
    }

    public function test_activate_switches_default_and_guards_deletion(): void
    {
        $newId = $this->createNewCurriculum();

        $this->postJson("/api/curricula/{$newId}/activate")->assertOk();
        $this->assertTrue(Curriculum::find($newId)->is_default);
        $this->assertFalse($this->old->fresh()->is_default);
        $this->getJson('/api/courses')->assertOk()->assertJsonPath('0.curriculum_id', $newId);

        $this->deleteJson("/api/curricula/{$newId}")->assertStatus(422);
        $this->deleteJson("/api/curricula/{$this->old->id}")->assertStatus(422);
        $this->putJson("/api/curricula/{$newId}", ['code' => '2024', 'name' => 'Kurikulum 2024', 'status' => 'Nonaktif'])->assertStatus(422);

        $empty = $this->postJson('/api/curricula', ['code' => 'DRAFT', 'name' => 'Draf'])->assertCreated()->json('id');
        $this->deleteJson("/api/curricula/{$empty}")->assertNoContent();
    }

    public function test_student_achievements_use_curriculum_of_their_cohort(): void
    {
        $newId = $this->createNewCurriculum();
        $oldStudent = Student::create(['id' => (string) Str::uuid(), 'nim' => '2101', 'name' => 'Lama', 'angkatan' => '2021', 'kelas' => 'A', 'status' => 'Aktif', 'department_id' => $this->department->id]);
        $newStudent = Student::create(['id' => (string) Str::uuid(), 'nim' => '2401', 'name' => 'Baru', 'angkatan' => '2024', 'kelas' => 'A', 'status' => 'Aktif', 'department_id' => $this->department->id]);
        $oldCourse = Course::where('curriculum_id', $this->old->id)->first();
        StudentGrade::create(['id' => (string) Str::uuid(), 'student_id' => $oldStudent->id, 'course_id' => $oldCourse->id, 'grade' => 'A', 'score' => 90, 'semester' => '1', 'academic_year' => '2021/2022']);

        $oldCplIds = Cpl::where('curriculum_id', $this->old->id)->pluck('id')->all();
        $newCplIds = Cpl::where('curriculum_id', $newId)->pluck('id')->all();

        $oldResult = collect($this->getJson("/api/cpl/achievements/{$oldStudent->id}")->assertOk()->json());
        $this->assertEqualsCanonicalizing($oldCplIds, $oldResult->pluck('id')->all());

        $newResult = collect($this->getJson("/api/cpl/achievements/{$newStudent->id}")->assertOk()->json());
        $this->assertEqualsCanonicalizing($newCplIds, $newResult->pluck('id')->all());
    }

    public function test_curriculum_of_other_department_is_ignored_and_not_editable(): void
    {
        $otherDepartment = Department::create(['name' => 'D2 Administrasi Pajak', 'code' => 'AP']);
        $foreign = Curriculum::create(['department_id' => $otherDepartment->id, 'code' => '2022', 'name' => 'Kurikulum Pajak', 'is_default' => true]);

        $this->getJson('/api/courses', ['X-Curriculum-Id' => $foreign->id])->assertOk()->assertJsonPath('0.curriculum_id', $this->old->id);
        $this->putJson("/api/curricula/{$foreign->id}", ['code' => 'X', 'name' => 'Ambil alih'])->assertNotFound();
        $this->postJson("/api/curricula/{$foreign->id}/activate")->assertNotFound();
        $this->getJson('/api/curricula')->assertOk()->assertJsonCount(1);
    }
}
