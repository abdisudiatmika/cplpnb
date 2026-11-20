<?php

namespace Tests\Feature;

use App\Models\Cpl;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class GraduateProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_profile_before_mapping_cpl(): void
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'D3 Akuntansi']);
        $admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin-profile@example.test', 'password' => Hash::make('password'), 'role' => 'admin_jurusan', 'department_id' => $department->id]);

        $this->actingAs($admin)->postJson('/api/graduate-profiles', [
            'code' => 'PL-1', 'name' => 'Staf Akuntansi', 'summary' => 'Mengelola pelaporan keuangan perusahaan.',
            'curriculumVersion' => '2026', 'status' => 'Aktif', 'sequence' => 1,
        ])->assertCreated()->assertJsonCount(0, 'cplMappings');
    }

    public function test_admin_manages_profile_with_core_and_supporting_cpl(): void
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'D3 Akuntansi']);
        $admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin-pl@example.test', 'password' => Hash::make('password'), 'role' => 'admin_jurusan', 'department_id' => $department->id]);
        $cpl1 = Cpl::create(['department_id' => $department->id, 'code' => 'CPL-1', 'description' => 'CPL satu', 'target_value' => 75]);
        $cpl4 = Cpl::create(['department_id' => $department->id, 'code' => 'CPL-4', 'description' => 'CPL empat', 'target_value' => 75]);

        $response = $this->actingAs($admin)->postJson('/api/graduate-profiles', [
            'code' => 'PL-1', 'name' => 'Staf Akuntansi dan Keuangan', 'englishName' => 'Accounting and Finance Officer',
            'summary' => 'Mengelola pelaporan keuangan dengan dukungan teknologi informasi.', 'curriculumVersion' => '2026',
            'status' => 'Aktif', 'sequence' => 1, 'cplMappings' => [
                ['cplId' => $cpl4->id, 'type' => 'core'], ['cplId' => $cpl1->id, 'type' => 'supporting'],
            ],
        ]);

        $response->assertCreated()->assertJsonPath('code', 'PL-1')->assertJsonCount(2, 'cplMappings');
        $this->actingAs($admin)->getJson('/api/graduate-profiles')->assertOk()
            ->assertJsonFragment(['cplCode' => 'CPL-4', 'type' => 'core'])
            ->assertJsonFragment(['cplCode' => 'CPL-1', 'type' => 'supporting']);
    }

    public function test_profile_rejects_cpl_from_another_department(): void
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $other = Department::create(['id' => (string) Str::uuid(), 'code' => 'TI', 'name' => 'Teknologi Informasi']);
        $admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin-scope@example.test', 'password' => Hash::make('password'), 'role' => 'admin_jurusan', 'department_id' => $department->id]);
        $foreignCpl = Cpl::create(['department_id' => $other->id, 'code' => 'CPL-1', 'description' => 'CPL asing', 'target_value' => 75]);

        $this->actingAs($admin)->postJson('/api/graduate-profiles', [
            'code' => 'PL-1', 'name' => 'Profil', 'summary' => 'Ringkasan profil lulusan.', 'curriculumVersion' => '2026',
            'status' => 'Aktif', 'sequence' => 1, 'cplMappings' => [['cplId' => $foreignCpl->id, 'type' => 'core']],
        ])->assertStatus(422);
    }
}
