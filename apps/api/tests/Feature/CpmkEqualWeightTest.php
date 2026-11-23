<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\CpmkCplMapping;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class CpmkEqualWeightTest extends TestCase
{
    use RefreshDatabase;

    private Department $department;
    private User $admin;
    private Course $course;

    protected function setUp(): void
    {
        parent::setUp();
        $this->department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $this->admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin-bobot@example.test', 'password' => Hash::make('password123'), 'role' => 'admin_jurusan', 'department_id' => $this->department->id]);
        foreach ([1, 2, 6] as $number) {
            Cpl::create(['department_id' => $this->department->id, 'code' => 'CPL-'.$number, 'description' => 'CPL '.$number, 'category' => 'Terintegrasi', 'target_value' => 75]);
        }
        $this->course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'AUD1', 'name' => 'Audit 1', 'sks' => 3, 'semester' => 2]);
    }

    public function test_weights_follow_number_of_active_cpmks(): void
    {
        $first = $this->addCpmk('CPMK01-01', 'CPL-1', 3); // bobot manual diabaikan
        $this->assertWeights(['CPMK01-01' => 100]);

        $this->addCpmk('CPMK02-01', 'CPL-2', 1);
        $this->assertWeights(['CPMK01-01' => 50, 'CPMK02-01' => 50]);

        $third = $this->addCpmk('CPMK06-01', 'CPL-6', 2);
        $this->assertWeights(['CPMK01-01' => 33.33, 'CPMK02-01' => 33.33, 'CPMK06-01' => 33.34]);
        $this->assertCourseMappings(['CPL-1' => 33.33, 'CPL-2' => 33.33, 'CPL-6' => 33.34]);

        $this->addCpmk('CPMK06-02', 'CPL-6');
        $this->assertWeights(['CPMK01-01' => 25, 'CPMK02-01' => 25, 'CPMK06-01' => 25, 'CPMK06-02' => 25]);
        $this->assertCourseMappings(['CPL-1' => 25, 'CPL-2' => 25, 'CPL-6' => 50]);

        // Nonaktif tidak ikut dibagi.
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$third['id']}", ['status' => 'Nonaktif'])->assertOk();
        $this->assertWeights(['CPMK01-01' => 33.33, 'CPMK02-01' => 33.33, 'CPMK06-02' => 33.34]);

        $this->actingAs($this->admin)->deleteJson("/api/cpmks/{$first['id']}")->assertNoContent();
        $this->assertWeights(['CPMK02-01' => 50, 'CPMK06-02' => 50]);
    }

    public function test_migration_rebalances_legacy_one_to_three_weights(): void
    {
        $weights = ['CPMK01-01' => 1, 'CPMK02-01' => 2, 'CPMK06-01' => 3];
        foreach ($weights as $code => $weight) {
            $cpmk = Cpmk::create(['course_id' => $this->course->id, 'code' => $code, 'description' => $code, 'status' => 'Aktif']);
            CpmkCplMapping::create(['cpmk_id' => $cpmk->id, 'cpl_id' => Cpl::where('code', 'CPL-'.(int) substr($code, 4, 2))->value('id'), 'contribution_weight' => $weight]);
        }

        $migration = require database_path('migrations/2026_11_23_000002_rebalance_cpmk_weights_equally.php');
        $migration->up();

        $this->assertWeights(['CPMK01-01' => 33.33, 'CPMK02-01' => 33.33, 'CPMK06-01' => 33.34]);
        $this->assertCourseMappings(['CPL-1' => 33.33, 'CPL-2' => 33.33, 'CPL-6' => 33.34]);
    }

    private function addCpmk(string $code, string $cplCode, ?float $weight = null): array
    {
        return $this->actingAs($this->admin)->postJson('/api/cpmks', array_filter([
            'courseId' => $this->course->id,
            'courseCode' => $this->course->code,
            'code' => $code,
            'description' => 'Deskripsi '.$code,
            'cplCode' => $cplCode,
            'contributionWeight' => $weight,
            'status' => 'Aktif',
        ], fn ($value) => $value !== null))->assertCreated()->json();
    }

    private function assertWeights(array $expected): void
    {
        $actual = CpmkCplMapping::join('cpmks', 'cpmk_cpl_mappings.cpmk_id', '=', 'cpmks.id')
            ->where('cpmks.course_id', $this->course->id)->where('cpmks.status', 'Aktif')
            ->orderBy('cpmks.code')->pluck('cpmk_cpl_mappings.contribution_weight', 'cpmks.code')
            ->map(fn ($weight) => (float) $weight)->all();
        $this->assertEquals($expected, $actual);
    }

    private function assertCourseMappings(array $expected): void
    {
        $actual = CourseCplMapping::with('cpl')->where('course_id', $this->course->id)->get()
            ->mapWithKeys(fn ($mapping) => [$mapping->cpl->code => round((float) $mapping->weight, 2)])
            ->sortKeys()->all();
        $this->assertEquals($expected, $actual);
    }
}
