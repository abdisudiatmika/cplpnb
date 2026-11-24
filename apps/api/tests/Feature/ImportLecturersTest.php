<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Lecturer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class ImportLecturersTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_creates_shared_lecturers_without_email_and_new_departments(): void
    {
        $akuntansi = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'D3 Akuntansi']);
        $existingUser = User::create(['id' => (string) Str::uuid(), 'name' => 'Sudah Ada', 'email' => 'ada@example.test', 'password' => Hash::make('password123'), 'role' => 'dosen', 'department_id' => $akuntansi->id]);
        Lecturer::create(['user_id' => $existingUser->id, 'department_id' => $akuntansi->id, 'employee_number' => '197001012000011001', 'status' => 'Aktif']);

        $file = tempnam(sys_get_temp_dir(), 'dosen').'.json';
        file_put_contents($file, json_encode(['items' => [
            ['name' => 'Dosen Akuntansi', 'nip' => '198001012005011002', 'penempatan' => 'D3 - Akuntansi', 'ikatanKerja' => 'Dosen Tetap'],
            ['name' => 'Sudah Ada', 'nip' => '197001012000011001', 'penempatan' => 'D3 - Akuntansi', 'ikatanKerja' => 'Dosen Tetap'],
            ['name' => 'Dosen Non ASN', 'nip' => null, 'nuptk' => '1234567890123456', 'penempatan' => 'D4 - Akuntansi Manajerial', 'ikatanKerja' => 'Dosen Tetap Perjanjian Kerja Waktu Tertentu'],
            ['name' => 'Dosen Manajerial 2', 'nip' => '199001012019031003', 'penempatan' => 'D4 - Akuntansi  Manajerial', 'ikatanKerja' => 'Dosen Tetap'],
            ['name' => 'Pengajar', 'nip' => '199101012019031004', 'penempatan' => 'D3 - Akuntansi', 'ikatanKerja' => 'Pengajar nondosen'],
            ['name' => 'Tanpa Nomor', 'penempatan' => 'D3 - Akuntansi', 'ikatanKerja' => 'Dosen Tetap'],
        ]]));

        // Simulasi tidak menyimpan apa pun; tanpa --buat-prodi prodi baru tidak dibuat.
        $this->artisan('dosen:impor', ['file' => $file])->assertSuccessful();
        $this->assertSame(1, Lecturer::count());

        $this->artisan('dosen:impor', ['file' => $file, '--apply' => true, '--buat-prodi' => true])->assertSuccessful();

        $this->assertSame(4, Lecturer::count());
        $baru = Lecturer::with('user', 'department')->where('employee_number', '198001012005011002')->first();
        $this->assertSame($akuntansi->id, $baru->department_id);
        $this->assertNull($baru->user->email);
        $this->assertSame('dosen', $baru->user->role);

        $manajerial = Department::where('name', 'D4 Akuntansi Manajerial')->first();
        $this->assertNotNull($manajerial);
        $this->assertSame('D4-AM', $manajerial->code);
        $this->assertSame(2, Lecturer::where('department_id', $manajerial->id)->count());
        $this->assertTrue(Lecturer::where('employee_number', '1234567890123456')->exists());
        $this->assertFalse(Lecturer::where('employee_number', '199101012019031004')->exists());

        // Impor ulang tidak menggandakan.
        $this->artisan('dosen:impor', ['file' => $file, '--apply' => true, '--buat-prodi' => true])->assertSuccessful();
        $this->assertSame(4, Lecturer::count());
        $this->assertSame(1, Department::where('name', 'D4 Akuntansi Manajerial')->count());
    }

    public function test_lecturer_logs_in_with_employee_number_or_email(): void
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'D3 Akuntansi']);
        $user = User::create(['id' => (string) Str::uuid(), 'name' => 'Dosen NIP', 'email' => null, 'password' => Hash::make('rahasia-123'), 'role' => 'dosen', 'department_id' => $department->id]);
        Lecturer::create(['user_id' => $user->id, 'department_id' => $department->id, 'employee_number' => '198001012005011002', 'status' => 'Aktif']);

        $this->postJson('/api/login', ['email' => '198001012005011002', 'password' => 'salah'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => ' 198001012005011002 ', 'password' => 'rahasia-123'])
            ->assertOk()->assertJsonPath('user.name', 'Dosen NIP');

        // Akun dengan email tetap login dengan email.
        $admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin@example.test', 'password' => Hash::make('password123'), 'role' => 'admin_jurusan', 'department_id' => $department->id]);
        $this->postJson('/api/logout');
        $this->postJson('/api/login', ['email' => 'admin@example.test', 'password' => 'password123'])->assertOk()->assertJsonPath('user.name', 'Admin');
    }

    public function test_admin_can_create_lecturer_without_email(): void
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'D3 Akuntansi']);
        $admin = User::create(['id' => (string) Str::uuid(), 'name' => 'Admin', 'email' => 'admin@example.test', 'password' => Hash::make('password123'), 'role' => 'admin_jurusan', 'department_id' => $department->id]);

        $this->actingAs($admin)->postJson('/api/lecturers', ['name' => 'Tanpa Email', 'password' => 'password123', 'employee_number' => 'NIP-X'])
            ->assertCreated()->assertJsonPath('email', null);
        $this->actingAs($admin)->postJson('/api/lecturers', ['name' => 'Tanpa Email 2', 'email' => '', 'password' => 'password123', 'employee_number' => 'NIP-Y'])
            ->assertCreated();
        $this->assertSame(2, User::whereNull('email')->count());
    }
}
