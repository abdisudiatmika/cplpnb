<?php

namespace Tests\Feature;

use App\Console\Commands\MigrateLegacyGrades;
use App\Models\AssessmentPlan;
use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\GradeSubmission;
use App\Models\Student;
use App\Models\StudentAssessmentScore;
use App\Models\StudentGrade;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MigrateLegacyGradesTest extends TestCase
{
    use RefreshDatabase;

    private Department $department;
    private Student $student;
    private Course $accounting;
    private Course $tax;

    protected function setUp(): void
    {
        parent::setUp();
        $this->department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        $cpl1 = Cpl::create(['code' => 'CPL-1', 'description' => 'Sikap', 'target_value' => 75, 'department_id' => $this->department->id]);
        $cpl2 = Cpl::create(['code' => 'CPL-2', 'description' => 'Pengetahuan', 'target_value' => 75, 'department_id' => $this->department->id]);
        $this->accounting = Course::create(['code' => 'AK101', 'name' => 'Pengantar Akuntansi', 'sks' => 3, 'department_id' => $this->department->id]);
        $this->tax = Course::create(['code' => 'AK102', 'name' => 'Perpajakan', 'sks' => 2, 'department_id' => $this->department->id]);
        CourseCplMapping::create(['course_id' => $this->accounting->id, 'cpl_id' => $cpl1->id, 'weight' => 3]);
        CourseCplMapping::create(['course_id' => $this->accounting->id, 'cpl_id' => $cpl2->id, 'weight' => 1]);
        CourseCplMapping::create(['course_id' => $this->tax->id, 'cpl_id' => $cpl2->id, 'weight' => 2]);

        $this->student = Student::create(['id' => (string) Str::uuid(), 'nim' => '2401', 'name' => 'Mahasiswa', 'angkatan' => '2024', 'kelas' => 'A', 'status' => 'Aktif', 'department_id' => $this->department->id]);
        // Percobaan lama (diabaikan), percobaan ulang terbaru (dipakai), dan skor skala 10.
        $this->grade($this->accounting, 'C', 60, '1', '2024/2025');
        $this->grade($this->accounting, 'A', 90, '3', '2025/2026');
        $this->grade($this->tax, 'AB', 8.1, '2', '2024/2025');

        Sanctum::actingAs(User::create([
            'id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin@example.test',
            'password' => Hash::make('rahasia-panjang'), 'role' => 'admin_jurusan', 'department_id' => $this->department->id,
        ]));
    }

    private function grade(Course $course, string $letter, float $score, string $semester, string $year): void
    {
        StudentGrade::create(['id' => (string) Str::uuid(), 'student_id' => $this->student->id, 'course_id' => $course->id, 'grade' => $letter, 'score' => $score, 'semester' => $semester, 'academic_year' => $year]);
    }

    private function achievements(): array
    {
        return collect($this->getJson("/api/cpl/achievements/{$this->student->id}")->assertOk()->json())
            ->mapWithKeys(fn ($row) => [$row['code'] => $row['value']])->all();
    }

    public function test_simulation_writes_nothing(): void
    {
        $this->artisan('nilai:migrasi-lama')->assertSuccessful();

        $this->assertSame(0, AssessmentPlan::count());
        $this->assertSame(0, Cpmk::count());
    }

    public function test_apply_keeps_final_scores_and_cpl_achievements_identical(): void
    {
        $before = $this->achievements();

        $this->artisan('nilai:migrasi-lama --apply')->assertSuccessful();

        // MK tanpa CPMK dibuatkan CPMK per CPL; bobot kontribusi = bobot pemetaan lama.
        $this->assertSame(3, Cpmk::count());
        $this->assertSame(2, AssessmentPlan::count());
        $this->assertSame(2, GradeSubmission::where('status', 'Locked')->count());

        $plan = AssessmentPlan::with('items')->whereHas('courseOffering', fn ($q) => $q->where('course_id', $this->accounting->id))->first();
        $this->assertEqualsWithDelta(100, $plan->items->sum('weight'), 0.001);
        $this->assertTrue($plan->items->every(fn ($item) => $item->name === MigrateLegacyGrades::ITEM_NAME));
        $this->assertSame('Ganjil', $plan->courseOffering->academicPeriod->semester);
        $this->assertSame('2025/2026', $plan->courseOffering->academicPeriod->academic_year);
        $this->assertEqualsCanonicalizing([90.0, 90.0], StudentAssessmentScore::whereIn('assessment_item_id', $plan->items->pluck('id'))->pluck('score')->map(fn ($v) => (float) $v)->all());

        $after = $this->achievements();
        $this->assertEquals($before, $after);
        // CPL-1 hanya dari AK101 (90); CPL-2 = (90*1 + 81*2) / 3 = 84.
        $this->assertEqualsWithDelta(90, $after['CPL-1'], 0.01);
        $this->assertEqualsWithDelta(84, $after['CPL-2'], 0.01);

        // Aman dijalankan ulang.
        $this->artisan('nilai:migrasi-lama --apply')->assertSuccessful();
        $this->assertSame(2, AssessmentPlan::count());
        $this->assertSame(3, Cpmk::count());
        $this->assertSame(3, StudentAssessmentScore::count());
        $this->assertSame(3, StudentGrade::count());
    }

    public function test_course_with_lecturer_plan_is_not_overwritten(): void
    {
        $this->artisan('nilai:migrasi-lama --apply')->assertSuccessful();
        $plan = AssessmentPlan::with('items')->whereHas('courseOffering', fn ($q) => $q->where('course_id', $this->tax->id))->first();
        $plan->items()->update(['name' => 'UTS']);

        $this->artisan('nilai:migrasi-lama')->assertSuccessful();
        $this->assertSame('UTS', $plan->items()->first()->name);
        $this->assertSame(2, AssessmentPlan::count());
    }

    public function test_period_follows_cohort_and_semester_not_inconsistent_stored_year(): void
    {
        // Tahun ajaran tersimpan keliru (angkatan 2024 semester 2 tercatat 2026/2027).
        StudentGrade::where('course_id', $this->tax->id)->update(['academic_year' => '2026/2027']);
        $filtered = fn () => collect($this->getJson("/api/cpl/achievements/{$this->student->id}?semesterType=genap&academicYear=2024/2025")->assertOk()->json())
            ->mapWithKeys(fn ($row) => [$row['code'] => $row['value']])->all();
        $before = $filtered();

        $this->artisan('nilai:migrasi-lama --apply')->assertSuccessful();

        $plan = AssessmentPlan::whereHas('courseOffering', fn ($q) => $q->where('course_id', $this->tax->id))->first();
        $this->assertSame('Genap', $plan->courseOffering->academicPeriod->semester);
        $this->assertSame('2024/2025', $plan->courseOffering->academicPeriod->academic_year);
        $this->assertEquals($before, $filtered());
        $this->assertEqualsWithDelta(81, $filtered()['CPL-2'], 0.01);
    }

    public function test_redo_rebuilds_previous_migration_without_duplicates(): void
    {
        $this->artisan('nilai:migrasi-lama --apply')->assertSuccessful();
        $plan = AssessmentPlan::whereHas('courseOffering', fn ($q) => $q->where('course_id', $this->tax->id))->first();
        // Simulasikan hasil migrasi lama di periode yang salah.
        $wrong = \App\Models\AcademicPeriod::create(['department_id' => $this->department->id, 'academic_year' => '2026/2027', 'semester' => 'Genap', 'status' => 'Selesai']);
        $plan->courseOffering->update(['academic_period_id' => $wrong->id]);

        $this->artisan('nilai:migrasi-lama --ulang --apply')->assertSuccessful();

        $this->assertSame(2, AssessmentPlan::count());
        $this->assertSame(3, StudentAssessmentScore::count());
        $this->assertFalse(\App\Models\AcademicPeriod::where('academic_year', '2026/2027')->exists());
        $this->assertSame(3, Cpmk::count());
    }
}
