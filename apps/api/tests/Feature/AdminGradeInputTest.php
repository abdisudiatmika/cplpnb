<?php

namespace Tests\Feature;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\CourseEnrollment;
use App\Models\CourseOffering;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\GradeSubmission;
use App\Models\Student;
use App\Models\StudentAssessmentScore;
use App\Models\StudentCpmkScore;
use App\Models\StudentGrade;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminGradeInputTest extends TestCase
{
    use RefreshDatabase;

    private Department $department;
    private User $admin;
    private Course $course;
    private Cpmk $cpmk1;
    private Cpmk $cpmk2;
    private Cpl $cpl1;
    private Cpl $cpl2;
    private Student $student;
    private Student $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $this->admin = $this->user('admin_jurusan', $this->department->id, 'admin-nilai@example.test');
        $this->cpl1 = Cpl::create(['department_id' => $this->department->id, 'code' => 'CPL-1', 'description' => 'CPL 1', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $this->cpl2 = Cpl::create(['department_id' => $this->department->id, 'code' => 'CPL-2', 'description' => 'CPL 2', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $this->course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'AK201', 'name' => 'Akuntansi Biaya', 'sks' => 3, 'semester' => 3]);
        $this->cpmk1 = Cpmk::create(['course_id' => $this->course->id, 'code' => 'CPMK01-01', 'description' => 'Menghitung biaya produksi', 'status' => 'Aktif']);
        $this->cpmk2 = Cpmk::create(['course_id' => $this->course->id, 'code' => 'CPMK02-01', 'description' => 'Menyusun laporan biaya', 'status' => 'Aktif']);
        $this->cpmk1->cplMappings()->create(['cpl_id' => $this->cpl1->id, 'contribution_weight' => 100]);
        $this->cpmk2->cplMappings()->create(['cpl_id' => $this->cpl2->id, 'contribution_weight' => 100]);
        CourseCplMapping::create(['course_id' => $this->course->id, 'cpl_id' => $this->cpl1->id, 'weight' => 50]);
        CourseCplMapping::create(['course_id' => $this->course->id, 'cpl_id' => $this->cpl2->id, 'weight' => 50]);
        $this->student = $this->student('2401', 'A');
        $this->other = $this->student('2402', 'B');
    }

    public function test_sheet_lists_course_cpmks_students_and_default_period(): void
    {
        StudentCpmkScore::create(['student_id' => $this->student->id, 'course_id' => $this->course->id, 'cpmk_id' => $this->cpmk1->id, 'score' => 88, 'semester' => '3', 'academic_year' => '2025/2026']);
        StudentGrade::create(['id' => (string) Str::uuid(), 'student_id' => $this->other->id, 'course_id' => $this->course->id, 'grade' => 'B', 'score' => 7.0, 'semester' => '3', 'academic_year' => '2025/2026']);

        $sheet = $this->actingAs($this->admin)
            ->getJson("/api/admin-grades/sheet?courseId={$this->course->id}&angkatan=2024")
            ->assertOk()
            ->assertJsonPath('course.code', 'AK201')
            ->assertJsonPath('cpmks.0.code', 'CPMK01-01')
            ->assertJsonPath('cpmks.0.cpls.0', 'CPL-1')
            ->assertJsonPath('defaults.semester', 3)
            ->assertJsonPath('defaults.academicYear', '2025/2026')
            ->json();

        $this->assertCount(2, $sheet['students']);
        $this->assertEquals(88, $sheet['students'][0]['cpmkScores'][$this->cpmk1->id]);
        $this->assertEquals(70, $sheet['students'][1]['single']['score']); // skala 0-10 ditampilkan 0-100

        $this->actingAs($this->admin)
            ->getJson("/api/admin-grades/sheet?courseId={$this->course->id}&angkatan=2024&kelas=B")
            ->assertOk()->assertJsonCount(1, 'students');
    }

    public function test_single_score_is_mapped_to_every_cpmk_of_the_course(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $this->student->id, 'score' => 80],
        ]))->assertOk()->assertJsonPath('saved', 1);

        $this->assertDatabaseHas('student_grades', ['student_id' => $this->student->id, 'course_id' => $this->course->id, 'grade' => 'AB', 'semester' => '3', 'academic_year' => '2025/2026']);
        $this->assertSame(['CPL-1' => 80, 'CPL-2' => 80], $this->achievements($this->student));

        // CPMK yang dihitung dari nilai satuan tampil di rincian transkrip.
        $details = $this->actingAs($this->admin)->getJson("/api/cpl/transcript/{$this->student->id}")->assertOk()->json();
        $this->assertNotEmpty($details);
    }

    public function test_cpmk_scores_override_single_score_only_for_filled_cpmks(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $this->student->id, 'score' => 80],
        ]))->assertOk();
        $this->actingAs($this->admin)->putJson('/api/admin-grades/cpmk-scores', $this->payload([
            ['studentId' => $this->student->id, 'scores' => [$this->cpmk1->id => 92]],
            ['studentId' => $this->other->id, 'scores' => [$this->cpmk1->id => 60, $this->cpmk2->id => 70]],
        ]))->assertOk()->assertJsonPath('saved', 3);

        $this->assertSame(['CPL-1' => 92, 'CPL-2' => 80], $this->achievements($this->student));
        $this->assertSame(['CPL-1' => 60, 'CPL-2' => 70], $this->achievements($this->other));

        // Rekap MK memakai rata-rata nilai CPMK admin, lalu nilai satuan.
        $summary = collect($this->actingAs($this->admin)->getJson('/api/cpl/course-summary')->assertOk()->json())->firstWhere('code', 'AK201');
        $this->assertSame(2, $summary['grades_count']);
        $this->assertEquals(round((92 + 80) / 2 / 2 + 65 / 2, 2), round($summary['average_grade'], 2));

        // Mengosongkan nilai berarti menghapus.
        $this->actingAs($this->admin)->putJson('/api/admin-grades/cpmk-scores', $this->payload([
            ['studentId' => $this->other->id, 'scores' => [$this->cpmk1->id => null, $this->cpmk2->id => null]],
        ]))->assertOk()->assertJsonPath('deleted', 2);
        $this->assertSame([], $this->achievements($this->other));
    }

    public function test_locked_lecturer_gradebook_takes_priority_over_admin_input(): void
    {
        $this->lockedLecturerGrades($this->student, 70);

        $this->actingAs($this->admin)->putJson('/api/admin-grades/cpmk-scores', $this->payload([
            ['studentId' => $this->student->id, 'scores' => [$this->cpmk1->id => 95, $this->cpmk2->id => 95]],
        ]))->assertOk()->assertJsonPath('dosenGraded', 1);
        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $this->student->id, 'score' => 95],
        ]))->assertOk();

        $this->assertSame(['CPL-1' => 70, 'CPL-2' => 70], $this->achievements($this->student));
        $this->actingAs($this->admin)
            ->getJson("/api/admin-grades/sheet?courseId={$this->course->id}&angkatan=2024")
            ->assertJsonPath('students.0.dosenGraded', true)
            ->assertJsonPath('students.1.dosenGraded', false);
    }

    public function test_admin_changes_apply_to_courses_mirrored_by_legacy_migration(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $this->student->id, 'score' => 80],
        ]))->assertOk();
        $this->artisan('nilai:migrasi-lama --apply')->assertSuccessful();
        $this->assertSame(1, AssessmentPlan::count());

        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $this->student->id, 'score' => 50],
        ]))->assertOk()->assertJsonPath('dosenGraded', 0);

        $this->assertSame(['CPL-1' => 50, 'CPL-2' => 50], $this->achievements($this->student));
    }

    public function test_course_without_cpmk_uses_course_cpl_mapping(): void
    {
        $plain = Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'AK101', 'name' => 'Pengantar', 'sks' => 2, 'semester' => 1]);
        CourseCplMapping::create(['course_id' => $plain->id, 'cpl_id' => $this->cpl2->id, 'weight' => 25]);

        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', [
            'courseId' => $plain->id, 'semester' => 1, 'academicYear' => '2024/2025',
            'rows' => [['studentId' => $this->student->id, 'score' => 64]],
        ])->assertOk();

        $this->assertSame(['CPL-2' => 64], $this->achievements($this->student));
    }

    public function test_invalid_input_is_rejected(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $this->student->id, 'score' => 101],
        ]))->assertStatus(422);

        $foreignCourse = Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'AK999', 'name' => 'Lain', 'sks' => 2, 'semester' => 1]);
        $foreignCpmk = Cpmk::create(['course_id' => $foreignCourse->id, 'code' => 'CPMK01-01', 'description' => 'Lain', 'status' => 'Aktif']);
        $this->actingAs($this->admin)->putJson('/api/admin-grades/cpmk-scores', $this->payload([
            ['studentId' => $this->student->id, 'scores' => [$foreignCpmk->id => 80]],
        ]))->assertStatus(422);

        $otherDepartment = Department::create(['id' => (string) Str::uuid(), 'code' => 'MN', 'name' => 'Manajemen']);
        $outsider = Student::create(['id' => (string) Str::uuid(), 'department_id' => $otherDepartment->id, 'nim' => '9901', 'name' => 'Luar', 'angkatan' => '2024', 'kelas' => 'A', 'status' => 'Aktif']);
        $this->actingAs($this->admin)->putJson('/api/admin-grades/single-scores', $this->payload([
            ['studentId' => $outsider->id, 'score' => 80],
        ]))->assertStatus(403);

        $lecturer = $this->user('dosen', $this->department->id, 'dosen-nilai@example.test');
        $this->actingAs($lecturer)->getJson("/api/admin-grades/sheet?courseId={$this->course->id}&angkatan=2024")->assertStatus(403);

        $this->assertSame(0, StudentGrade::count());
        $this->assertSame(0, StudentCpmkScore::count());
    }

    public function test_cpmk_with_admin_scores_cannot_be_deleted(): void
    {
        StudentCpmkScore::create(['student_id' => $this->student->id, 'course_id' => $this->course->id, 'cpmk_id' => $this->cpmk1->id, 'score' => 88, 'semester' => '3', 'academic_year' => '2025/2026']);

        $this->actingAs($this->admin)->deleteJson("/api/cpmks/{$this->cpmk1->id}")->assertStatus(409);
        $this->actingAs($this->admin)->deleteJson("/api/courses/{$this->course->id}")->assertStatus(409);
        $this->actingAs($this->admin)->deleteJson("/api/students/{$this->student->id}")->assertStatus(409);
        $this->assertDatabaseHas('cpmks', ['id' => $this->cpmk1->id]);
    }

    private function payload(array $rows): array
    {
        return ['courseId' => $this->course->id, 'semester' => 3, 'academicYear' => '2025/2026', 'rows' => $rows];
    }

    private function achievements(Student $student): array
    {
        return collect($this->actingAs($this->admin)->getJson("/api/cpl/achievements/{$student->id}")->assertOk()->json())
            ->filter(fn ($row) => $row['status'] !== 'Belum Diukur')
            ->mapWithKeys(fn ($row) => [$row['code'] => $row['value']])
            ->all();
    }

    private function lockedLecturerGrades(Student $student, float $score): void
    {
        $period = AcademicPeriod::create(['department_id' => $this->department->id, 'academic_year' => '2025/2026', 'semester' => 'Ganjil', 'status' => 'Aktif']);
        $class = AcademicClass::create(['department_id' => $this->department->id, 'name' => 'A', 'cohort_year' => 2024, 'status' => 'Aktif']);
        $offering = CourseOffering::create(['course_id' => $this->course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id, 'status' => 'Aktif']);
        $plan = AssessmentPlan::create(['course_offering_id' => $offering->id, 'version' => 1, 'status' => 'Published', 'published_by' => $this->admin->id, 'published_at' => now()]);
        $items = [
            AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $this->cpmk1->id, 'category' => 'midterm', 'name' => 'UTS', 'weight' => 50, 'sequence' => 1, 'is_required' => true]),
            AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $this->cpmk2->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 50, 'sequence' => 2, 'is_required' => true]),
        ];
        $enrollment = CourseEnrollment::create(['course_offering_id' => $offering->id, 'student_id' => $student->id, 'enrollment_status' => 'active']);
        foreach ($items as $item) {
            StudentAssessmentScore::create(['course_enrollment_id' => $enrollment->id, 'assessment_item_id' => $item->id, 'score' => $score, 'eligibility_status' => 'eligible']);
        }
        GradeSubmission::create(['assessment_plan_id' => $plan->id, 'status' => 'Locked', 'locked_by' => $this->admin->id, 'locked_at' => now()]);
    }

    private function student(string $nim, string $kelas): Student
    {
        return Student::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'nim' => $nim, 'name' => 'Mahasiswa '.$nim, 'angkatan' => '2024', 'kelas' => $kelas, 'status' => 'Aktif']);
    }

    private function user(string $role, ?string $departmentId, string $email): User
    {
        return User::create(['id' => (string) Str::uuid(), 'name' => $email, 'email' => $email, 'password' => Hash::make('password123'), 'role' => $role, 'department_id' => $departmentId]);
    }
}
