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

/** Bobot CPMK diisi manual oleh admin prodi; total CPMK aktif per mata kuliah maksimal 100%. */
class CpmkWeightTest extends TestCase
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
        foreach ([3, 7, 9, 10] as $number) {
            Cpl::create(['department_id' => $this->department->id, 'code' => 'CPL-'.$number, 'description' => 'CPL '.$number, 'category' => 'Terintegrasi', 'target_value' => 75]);
        }
        $this->course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $this->department->id, 'code' => 'ABP', 'name' => 'Akuntansi Biaya Praktikum', 'sks' => 3, 'semester' => 3]);
    }

    public function test_admin_enters_rps_weights_freely_up_to_one_hundred_percent(): void
    {
        $this->addCpmk('CPMK07-01', 'CPL-7', 22.5)->assertCreated();
        $this->addCpmk('CPMK09-01', 'CPL-9', 25)->assertCreated();
        $this->addCpmk('CPMK03-01', 'CPL-3', 22.5)->assertCreated();
        $this->assertWeights(['CPMK03-01' => 22.5, 'CPMK07-01' => 22.5, 'CPMK09-01' => 25]);

        // Melebihi 100% ditolak dan tidak tersimpan.
        $this->addCpmk('CPMK10-01', 'CPL-10', 35)->assertStatus(422)
            ->assertJsonPath('errors.contributionWeight.0', fn ($message) => str_contains($message, '105%') && str_contains($message, 'maksimal untuk CPMK ini 30%'));
        $this->assertSame(3, Cpmk::count());

        $last = $this->addCpmk('CPMK10-01', 'CPL-10', 30)->assertCreated()->json();
        $this->assertWeights(['CPMK03-01' => 22.5, 'CPMK07-01' => 22.5, 'CPMK09-01' => 25, 'CPMK10-01' => 30]);
        $this->assertCourseMappings(['CPL-10' => 30, 'CPL-3' => 22.5, 'CPL-7' => 22.5, 'CPL-9' => 25]);
    }

    public function test_bobot_requirements_on_create_and_edit(): void
    {
        $this->addCpmk('CPMK07-01', 'CPL-7')->assertStatus(422)->assertJsonValidationErrors('contributionWeight');

        $a = $this->addCpmk('CPMK07-01', 'CPL-7', 50)->assertCreated()->json();
        $b = $this->addCpmk('CPMK09-01', 'CPL-9', 50)->assertCreated()->json();

        // Menaikkan satu bobot sebelum menurunkan yang lain ditolak.
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$a['id']}", ['contributionWeight' => 60])->assertStatus(422);
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$b['id']}", ['contributionWeight' => 40])->assertOk();
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$a['id']}", ['contributionWeight' => 60])->assertOk();
        $this->assertWeights(['CPMK07-01' => 60, 'CPMK09-01' => 40]);

        // Edit deskripsi tanpa bobot tidak mengubah bobot; nonaktif tidak dihitung dan tidak membagi ulang.
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$a['id']}", ['description' => 'Baru'])->assertOk();
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$b['id']}", ['status' => 'Nonaktif'])->assertOk();
        $this->assertWeights(['CPMK07-01' => 60]);
        $this->assertCourseMappings(['CPL-7' => 60]);

        // Mengaktifkan kembali tetap boleh selama total <= 100.
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$b['id']}", ['status' => 'Aktif'])->assertOk();
        $this->assertWeights(['CPMK07-01' => 60, 'CPMK09-01' => 40]);

        $this->actingAs($this->admin)->deleteJson("/api/cpmks/{$b['id']}")->assertNoContent();
        $this->assertWeights(['CPMK07-01' => 60]);
    }

    public function test_legacy_course_above_one_hundred_can_still_be_edited_without_increasing_total(): void
    {
        $ids = [];
        foreach (['CPMK07-01' => 60, 'CPMK09-01' => 55] as $code => $weight) {
            $cpmk = Cpmk::create(['course_id' => $this->course->id, 'code' => $code, 'description' => $code, 'status' => 'Aktif']);
            CpmkCplMapping::create(['cpmk_id' => $cpmk->id, 'cpl_id' => Cpl::where('code', 'CPL-'.(int) substr($code, 4, 2))->value('id'), 'contribution_weight' => $weight]);
            $ids[$code] = $cpmk->id;
        }

        $this->actingAs($this->admin)->putJson("/api/cpmks/{$ids['CPMK07-01']}", ['description' => 'Diperbaiki'])->assertOk();
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$ids['CPMK07-01']}", ['contributionWeight' => 65])->assertStatus(422);
        $this->actingAs($this->admin)->putJson("/api/cpmks/{$ids['CPMK07-01']}", ['contributionWeight' => 45])->assertOk();
        $this->assertWeights(['CPMK07-01' => 45, 'CPMK09-01' => 55]);
    }

    public function test_migration_rebalances_legacy_one_to_three_weights(): void
    {
        $weights = ['CPMK03-01' => 1, 'CPMK07-01' => 2, 'CPMK09-01' => 3];
        foreach ($weights as $code => $weight) {
            $cpmk = Cpmk::create(['course_id' => $this->course->id, 'code' => $code, 'description' => $code, 'status' => 'Aktif']);
            CpmkCplMapping::create(['cpmk_id' => $cpmk->id, 'cpl_id' => Cpl::where('code', 'CPL-'.(int) substr($code, 4, 2))->value('id'), 'contribution_weight' => $weight]);
        }

        $migration = require database_path('migrations/2026_11_23_000002_rebalance_cpmk_weights_equally.php');
        $migration->up();

        $this->assertWeights(['CPMK03-01' => 33.33, 'CPMK07-01' => 33.33, 'CPMK09-01' => 33.34]);
        $this->assertCourseMappings(['CPL-3' => 33.33, 'CPL-7' => 33.33, 'CPL-9' => 33.34]);
    }

    private function addCpmk(string $code, string $cplCode, ?float $weight = null)
    {
        return $this->actingAs($this->admin)->postJson('/api/cpmks', array_filter([
            'courseId' => $this->course->id,
            'courseCode' => $this->course->code,
            'code' => $code,
            'description' => 'Deskripsi '.$code,
            'cplCode' => $cplCode,
            'contributionWeight' => $weight,
            'status' => 'Aktif',
        ], fn ($value) => $value !== null));
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
