<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\Student;
use App\Models\StudentCpmkScore;
use App\Models\StudentGrade;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class CpmkEvaluationReportTest extends TestCase
{
    use RefreshDatabase;

    private Department $department;
    private User $admin;
    private Course $course;
    private Cpmk $cpmkA;
    private Cpmk $cpmkB;
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $this->admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin-eval@example.test', 'password' => Hash::make('password123'), 'role' => 'admin_jurusan', 'department_id' => $this->department->id]);
        $cpl3 = Cpl::create(['department_id' => $this->department->id, 'code' => 'CPL-3', 'description' => 'CPL 3', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $cpl7 = Cpl::create(['department_id' => $this->department->id, 'code' => 'CPL-7', 'description' => 'CPL 7', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $this->course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'ABP', 'name' => 'Akuntansi Biaya Praktikum', 'sks' => 3, 'semester' => 3]);
        $this->cpmkA = Cpmk::create(['course_id' => $this->course->id, 'code' => 'CPMK03-01', 'description' => 'Menghitung HPP', 'status' => 'Aktif']);
        $this->cpmkB = Cpmk::create(['course_id' => $this->course->id, 'code' => 'CPMK07-01', 'description' => 'Menyusun laporan biaya', 'status' => 'Aktif']);
        $this->cpmkA->cplMappings()->create(['cpl_id' => $cpl3->id, 'contribution_weight' => 40]);
        $this->cpmkB->cplMappings()->create(['cpl_id' => $cpl7->id, 'contribution_weight' => 60]);
        foreach (['A' => ['2401', '2402', '2403'], 'B' => ['2404', '2405']] as $kelas => $nims) {
            foreach ($nims as $nim) {
                $this->students[$nim] = Student::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'nim' => $nim, 'name' => 'Mhs '.$nim, 'angkatan' => '2024', 'kelas' => $kelas, 'status' => 'Aktif']);
            }
        }
    }

    public function test_detail_counts_students_reaching_target_per_cpmk_and_class(): void
    {
        // CPMK03-01: 80, 90, 60 (kelas A), 76, 74 (kelas B) -> 3 dari 5 >= 75 = 60% -> Belum Tercapai.
        // CPMK07-01: 80, 85, 75, 90 + nilai satuan 2405 = 70 -> 4 dari 5 = 80% -> Tercapai.
        $scores = ['2401' => [80, 80], '2402' => [90, 85], '2403' => [60, 75], '2404' => [76, 90]];
        foreach ($scores as $nim => [$a, $b]) {
            $this->cpmkScore($nim, $this->cpmkA, $a);
            $this->cpmkScore($nim, $this->cpmkB, $b);
        }
        // Nilai satuan dibagikan ke kedua CPMK.
        StudentGrade::create(['id' => (string) Str::uuid(), 'student_id' => $this->students['2405']->id, 'course_id' => $this->course->id, 'grade' => 'BC', 'score' => 74, 'semester' => '3', 'academic_year' => '2025/2026']);

        $report = $this->actingAs($this->admin)->getJson("/api/reports/cpmk-evaluation/{$this->course->id}?angkatan=2024")
            ->assertOk()
            ->assertJsonPath('thresholds.minScore', 75)
            ->assertJsonPath('course.students', 5)
            ->assertJsonPath('course.cpmkAchieved', 1)
            ->assertJsonPath('course.status', 'Sebagian Tercapai')
            ->json();

        $a = $report['cpmks'][0];
        $this->assertSame('CPMK03-01', $a['code']);
        $this->assertEquals(40, $a['weight']);
        $this->assertSame(5, $a['measured']);
        $this->assertSame(3, $a['passed']);
        $this->assertEquals(60, $a['passedPercent']);
        $this->assertEquals(76, $a['average']);
        $this->assertSame('Belum Tercapai', $a['status']);
        $this->assertEquals(['kelas' => 'A', 'measured' => 3, 'passed' => 2], array_intersect_key($a['byClass'][0], array_flip(['kelas', 'measured', 'passed'])));
        $this->assertEquals(50, $a['byClass'][1]['passedPercent']);

        $b = $report['cpmks'][1];
        $this->assertSame(4, $b['passed']);
        $this->assertEquals(80, $b['passedPercent']);
        $this->assertSame('Tercapai', $b['status']);

        // Nilai mata kuliah per mahasiswa ditimbang bobot CPMK (40/60).
        $row = collect($report['students'])->firstWhere('nim', '2403');
        $this->assertEquals(69, $row['courseScore']); // (60*40 + 75*60) / 100
        $this->assertSame(1, $row['belowCount']);
        $this->assertSame(['nilai_satuan'], collect($report['students'])->firstWhere('nim', '2405')['sources']);

        // Filter kelas.
        $this->actingAs($this->admin)->getJson("/api/reports/cpmk-evaluation/{$this->course->id}?kelas=B")
            ->assertOk()->assertJsonPath('course.students', 2);
    }

    public function test_summary_lists_courses_with_active_cpmks(): void
    {
        foreach (['2401', '2402', '2403', '2404'] as $nim) {
            $this->cpmkScore($nim, $this->cpmkA, 90);
            $this->cpmkScore($nim, $this->cpmkB, 90);
        }
        Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'NOCPMK', 'name' => 'Tanpa CPMK', 'sks' => 2, 'semester' => 1]);

        $summary = $this->actingAs($this->admin)->getJson('/api/reports/cpmk-evaluation')->assertOk()->json();

        $this->assertCount(1, $summary['courses']);
        $this->assertSame('ABP', $summary['courses'][0]['code']);
        $this->assertSame(2, $summary['courses'][0]['cpmkAchieved']);
        $this->assertSame(4, $summary['courses'][0]['students']);
        $this->assertSame('Tercapai', $summary['courses'][0]['status']);
        $this->assertEquals(90, $summary['courses'][0]['average']);
    }

    public function test_period_filter_and_access(): void
    {
        $this->cpmkScore('2401', $this->cpmkA, 90); // semester 3 angkatan 2024 = Ganjil 2025/2026
        $this->actingAs($this->admin)->getJson("/api/reports/cpmk-evaluation/{$this->course->id}?semesterType=genap&academicYear=2025/2026")
            ->assertOk()->assertJsonPath('course.students', 0)->assertJsonPath('course.status', 'Belum Diukur');
        $this->actingAs($this->admin)->getJson("/api/reports/cpmk-evaluation/{$this->course->id}?semesterType=ganjil&academicYear=2025/2026")
            ->assertOk()->assertJsonPath('course.students', 1);

        $other = Department::create(['id' => (string) Str::uuid(), 'code' => 'MN', 'name' => 'Manajemen']);
        $otherAdmin = User::create(['id' => (string) Str::uuid(), 'name' => 'Lain', 'email' => 'lain@example.test', 'password' => Hash::make('password123'), 'role' => 'admin_jurusan', 'department_id' => $other->id]);
        $this->actingAs($otherAdmin)->getJson("/api/reports/cpmk-evaluation/{$this->course->id}")->assertNotFound();

        $lecturer = User::create(['id' => (string) Str::uuid(), 'name' => 'Dosen', 'email' => 'dosen-eval@example.test', 'password' => Hash::make('password123'), 'role' => 'dosen', 'department_id' => $this->department->id]);
        $this->actingAs($lecturer)->getJson('/api/reports/cpmk-evaluation')->assertForbidden();
    }

    private function cpmkScore(string $nim, Cpmk $cpmk, float $score): void
    {
        StudentCpmkScore::create(['student_id' => $this->students[$nim]->id, 'course_id' => $this->course->id, 'cpmk_id' => $cpmk->id, 'score' => $score, 'semester' => '3', 'academic_year' => '2025/2026']);
    }
}
