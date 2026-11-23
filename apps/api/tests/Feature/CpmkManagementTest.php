<?php

namespace Tests\Feature;

use App\Models\Cpl;
use App\Models\Course;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class CpmkManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_complete_d3_accounting_document_fixture_imports_without_loss_or_duplication(): void
    {
        $fixture = json_decode(
            file_get_contents(base_path('tests/Fixtures/d3-accounting-cpmk-2025-2026.json')),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
        // Dokumen CPMK tidak memuat bobot: CPMK baru membagi rata sisa bobot mata kuliahnya.
        $fixture['cpmks'] = array_map(fn (array $item) => array_diff_key($item, ['contributionWeight' => true]), $fixture['cpmks']);

        $department = $this->department($fixture['department']['code'], $fixture['department']['name']);
        $admin = $this->user('admin_jurusan', $department->id, 'fixture-admin@example.test');

        foreach ($fixture['cpls'] as $item) {
            Cpl::create([
                'id' => (string) Str::uuid(),
                'department_id' => $department->id,
                'code' => $item['code'],
                'description' => $item['description'],
                'target_value' => $item['targetValue'],
            ]);
        }
        foreach ($fixture['courses'] as $item) {
            $this->course($department, $item['code'], $item['name'], $item['semester'], $item['sks']);
        }

        $this->actingAs($admin)->postJson('/api/cpmks/bulk', ['items' => $fixture['cpmks']])
            ->assertOk()
            ->assertJsonCount(62);

        $this->assertDatabaseCount('courses', 18);
        $this->assertDatabaseCount('cpls', 10);
        $this->assertDatabaseCount('cpmks', 62);
        $this->assertDatabaseCount('cpmk_cpl_mappings', 62);

        $this->actingAs($admin)->postJson('/api/cpmks/bulk', ['items' => $fixture['cpmks']])->assertOk();
        $this->assertDatabaseCount('cpmks', 62);
        $this->assertDatabaseCount('cpmk_cpl_mappings', 62);
    }

    public function test_admin_can_import_document_style_cpmks_with_codes_repeated_across_courses(): void
    {
        [$department, $admin] = $this->academicContext();
        $this->course($department, 'MPK2462401101', 'Pendidikan Pancasila', 1);
        $this->course($department, 'MPK2462401103', 'Bahasa Indonesia', 1);

        $payload = ['items' => [
            [
                'courseCode' => 'MPK2462401101',
                'code' => 'CPMK01-01',
                'description' => 'Menunjukkan sikap sesuai nilai Pancasila.',
                'cplCode' => 'CPL-1',
                'curriculumVersion' => '2025/2026',
            ],
            [
                'courseCode' => 'MPK2462401101',
                'code' => 'CPMK08-01',
                'description' => 'Menyampaikan hasil kajian secara lisan dan tertulis.',
                'cplCode' => 'CPL-8',
                'curriculumVersion' => '2025/2026',
            ],
            [
                'courseCode' => 'MPK2462401103',
                'code' => 'CPMK01-01',
                'description' => 'Menunjukkan etika penulisan ilmiah.',
                'cplCode' => 'CPL-1',
                'curriculumVersion' => '2025/2026',
            ],
        ]];

        $this->actingAs($admin)->postJson('/api/cpmks/bulk', $payload)
            ->assertOk()
            ->assertJsonCount(3);

        $this->assertDatabaseCount('cpmks', 3);
        $this->assertDatabaseCount('cpmk_cpl_mappings', 3);
        $this->assertDatabaseCount('course_cpl_mappings', 3);

        // Import ulang harus memperbarui data yang sama, bukan menggandakannya.
        $payload['items'][0]['description'] = 'Rumusan CPMK Pancasila yang diperbarui.';
        $this->actingAs($admin)->postJson('/api/cpmks/bulk', $payload)->assertOk();
        $this->assertDatabaseCount('cpmks', 3);
        $this->assertDatabaseCount('course_cpl_mappings', 3);
        $this->assertDatabaseHas('cpmks', ['description' => 'Rumusan CPMK Pancasila yang diperbarui.']);
    }

    public function test_import_rejects_cpmk_when_code_prefix_does_not_match_cpl(): void
    {
        [$department, $admin] = $this->academicContext();
        $this->course($department, 'MKB2462401216', 'Audit 1', 2);

        $this->actingAs($admin)->postJson('/api/cpmks/bulk', ['items' => [[
            'courseCode' => 'MKB2462401216',
            'code' => 'CPMK06-01',
            'description' => 'Melaksanakan prosedur audit.',
            'cplCode' => 'CPL-2',
        ]]])->assertUnprocessable()->assertJsonValidationErrors('cplCode');

        $this->assertDatabaseCount('cpmks', 0);
    }

    public function test_admin_cannot_import_cpmk_using_course_from_another_department(): void
    {
        [$departmentA, $adminA] = $this->academicContext('AK', 'Akuntansi', 'admin-ak@example.test');
        $departmentB = $this->department('PN', 'Pariwisata');
        $this->course($departmentB, 'MKB-LAIN', 'Mata Kuliah Jurusan Lain', 1);

        $this->actingAs($adminA)->postJson('/api/cpmks/bulk', ['items' => [[
            'courseCode' => 'MKB-LAIN',
            'code' => 'CPMK01-01',
            'description' => 'Tidak boleh masuk.',
            'cplCode' => 'CPL-1',
        ]]])->assertUnprocessable();

        $this->assertDatabaseCount('cpmks', 0);
    }

    public function test_lecturer_can_read_department_cpmks_but_cannot_change_master_data(): void
    {
        [$department, $admin] = $this->academicContext();
        $this->course($department, 'MKK2462401102', 'Hukum Pajak', 1);
        $this->actingAs($admin)->postJson('/api/cpmks/bulk', ['items' => [[
            'courseCode' => 'MKK2462401102',
            'code' => 'CPMK05-01',
            'description' => 'Menjelaskan dasar administrasi perpajakan.',
            'cplCode' => 'CPL-5',
        ]]])->assertOk();

        $lecturer = $this->user('dosen', $department->id, 'dosen@example.test');
        $this->actingAs($lecturer)->getJson('/api/cpmks')->assertOk()->assertJsonCount(1);
        $this->actingAs($lecturer)->postJson('/api/cpmks/bulk', ['items' => [[
            'courseCode' => 'MKK2462401102',
            'code' => 'CPMK02-01',
            'description' => 'Tidak diizinkan.',
            'cplCode' => 'CPL-2',
        ]]])->assertForbidden();
    }

    private function academicContext(string $code = 'AK', string $name = 'Akuntansi', string $email = 'admin@example.test'): array
    {
        $department = $this->department($code, $name);
        $admin = $this->user('admin_jurusan', $department->id, $email);

        foreach (range(1, 10) as $number) {
            Cpl::create([
                'id' => (string) Str::uuid(),
                'department_id' => $department->id,
                'code' => 'CPL-' . $number,
                'description' => 'Rumusan CPL ' . $number,
                'target_value' => 75,
            ]);
        }

        return [$department, $admin];
    }

    private function department(string $code, string $name): Department
    {
        return Department::create(['id' => (string) Str::uuid(), 'code' => $code, 'name' => $name]);
    }

    private function course(Department $department, string $code, string $name, int $semester, int $sks = 2): Course
    {
        return Course::create([
            'id' => (string) Str::uuid(),
            'department_id' => $department->id,
            'code' => $code,
            'name' => $name,
            'sks' => $sks,
            'semester' => $semester,
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
