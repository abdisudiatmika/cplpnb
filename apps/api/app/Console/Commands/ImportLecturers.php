<?php

namespace App\Console\Commands;

use App\Models\Department;
use App\Models\Lecturer;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Impor dosen dari data kepegawaian (JSON hasil olah Excel "Master Sister").
 *
 * Yang disimpan hanya nama, nomor pegawai (NIP; bila kosong NUPTK lalu No. Registrasi), status,
 * dan homebase prodi. Email dikosongkan; dosen login dengan nomor pegawai setelah admin
 * menetapkan kata sandinya (kata sandi awal acak dan tidak diketahui siapa pun).
 *
 * Penempatan dicocokkan ke prodi SI-CPL berdasarkan nama (abaikan tanda baca/spasi/huruf besar),
 * atau lewat --map file JSON {"Penempatan di file": "kode prodi"}. Prodi yang tidak cocok dibuat
 * baru dengan --buat-prodi. Dosen yang nomor pegawainya sudah terdaftar dilewati.
 */
class ImportLecturers extends Command
{
    protected $signature = 'dosen:impor
        {file : Path JSON berisi items[name, nip?, nuptk?, registrasi?, penempatan, ikatanKerja?]}
        {--map= : File JSON pemetaan {"Penempatan": "kode prodi"}}
        {--buat-prodi : Buat prodi baru untuk penempatan yang belum terdaftar}
        {--apply : Simpan perubahan. Tanpa opsi ini hanya simulasi (rollback).}';

    protected $description = 'Impor dosen (data bersama lintas prodi) dari file JSON data kepegawaian.';

    private const SKIPPED_ENGAGEMENTS = ['pengajar nondosen'];

    public function handle(): int
    {
        $path = $this->argument('file');
        $payload = is_file($path) ? json_decode(file_get_contents($path), true) : null;
        if (! is_array($payload) || ! is_array($payload['items'] ?? null)) {
            $this->error('File tidak ditemukan atau formatnya tidak valid.');

            return self::FAILURE;
        }
        $map = [];
        if ($this->option('map')) {
            $map = json_decode((string) @file_get_contents($this->option('map')), true);
            if (! is_array($map)) {
                $this->error('File --map tidak valid.');

                return self::FAILURE;
            }
        }

        $apply = (bool) $this->option('apply');
        $this->info(($apply ? 'MODE: APPLY' : 'MODE: SIMULASI').($this->option('buat-prodi') ? ' | buat prodi baru: ya' : ''));

        $items = collect($payload['items'])->map(fn ($item) => [
            'name' => trim(preg_replace('/\s+/', ' ', (string) ($item['name'] ?? ''))),
            'number' => $this->employeeNumber($item),
            'penempatan' => trim(preg_replace('/\s+/', ' ', (string) ($item['penempatan'] ?? ''))),
            'ikatanKerja' => trim((string) ($item['ikatanKerja'] ?? '')),
        ]);

        $stats = ['baris' => $items->count(), 'nondosen' => 0, 'tanpa_nomor' => 0, 'tanpa_penempatan' => 0, 'sudah_ada' => 0, 'duplikat_di_file' => 0, 'dibuat' => 0];
        $skipped = [];
        $seen = [];
        $departments = Department::all();
        $byKey = $departments->keyBy(fn ($department) => $this->key($department->name));
        $byCode = $departments->keyBy(fn ($department) => strtoupper($department->code));
        $existingNumbers = Lecturer::pluck('employee_number')->map(fn ($number) => trim($number))->flip();
        $newDepartments = [];
        $perDepartment = [];

        DB::beginTransaction();
        try {
            foreach ($items as $item) {
                if (in_array(mb_strtolower($item['ikatanKerja']), self::SKIPPED_ENGAGEMENTS, true)) {
                    $stats['nondosen']++;

                    continue;
                }
                if ($item['name'] === '' || $item['number'] === null) {
                    $stats['tanpa_nomor']++;
                    $skipped[] = [$item['name'] ?: '-', '-', 'Tanpa NIP/NUPTK/No. Registrasi'];

                    continue;
                }
                if ($item['penempatan'] === '' || str_starts_with($item['penempatan'], '#')) {
                    $stats['tanpa_penempatan']++;
                    $skipped[] = [$item['name'], $item['number'], 'Penempatan kosong'];

                    continue;
                }
                if (isset($seen[$item['number']])) {
                    $stats['duplikat_di_file']++;
                    $skipped[] = [$item['name'], $item['number'], 'Nomor pegawai ganda di file'];

                    continue;
                }
                $seen[$item['number']] = true;
                if ($existingNumbers->has($item['number'])) {
                    $stats['sudah_ada']++;

                    continue;
                }

                $department = $this->resolveDepartment($item['penempatan'], $map, $byKey, $byCode);
                if (! $department) {
                    if (! $this->option('buat-prodi')) {
                        $skipped[] = [$item['name'], $item['number'], 'Prodi belum terdaftar: '.$item['penempatan']];

                        continue;
                    }
                    $department = Department::create([
                        'id' => (string) Str::uuid(),
                        'name' => $this->departmentName($item['penempatan']),
                        'code' => $this->uniqueCode($item['penempatan'], $byCode),
                    ]);
                    $byKey[$this->key($department->name)] = $department;
                    $byCode[strtoupper($department->code)] = $department;
                    $newDepartments[] = [$department->code, $department->name];
                }

                $user = User::create([
                    'id' => (string) Str::uuid(),
                    'name' => $item['name'],
                    'email' => null,
                    // Kata sandi awal acak: dosen baru bisa login setelah admin menetapkan kata sandinya.
                    'password' => Hash::make(Str::random(40)),
                    'role' => 'dosen',
                    'department_id' => $department->id,
                ]);
                Lecturer::create([
                    'user_id' => $user->id,
                    'department_id' => $department->id,
                    'employee_number' => $item['number'],
                    'status' => 'Aktif',
                ]);
                $stats['dibuat']++;
                $perDepartment[$department->code.' - '.$department->name] = ($perDepartment[$department->code.' - '.$department->name] ?? 0) + 1;
            }

            if ($apply) {
                DB::commit();
            } else {
                DB::rollBack();
            }
        } catch (\Throwable $exception) {
            DB::rollBack();
            $this->error('Gagal: '.$exception->getMessage());

            return self::FAILURE;
        }

        $this->table(['Keterangan', 'Jumlah'], collect([
            ['Baris di file', $stats['baris']],
            ['Dilewati: pengajar nondosen', $stats['nondosen']],
            ['Dilewati: tanpa nomor pegawai', $stats['tanpa_nomor']],
            ['Dilewati: penempatan kosong', $stats['tanpa_penempatan']],
            ['Dilewati: ganda di file', $stats['duplikat_di_file']],
            ['Dilewati: sudah terdaftar di SI-CPL', $stats['sudah_ada']],
            ['Dilewati: prodi belum terdaftar', count(array_filter($skipped, fn ($row) => str_starts_with($row[2], 'Prodi')))],
            ['Dosen baru', $stats['dibuat']],
            ['Prodi baru', count($newDepartments)],
        ])->all());
        if ($newDepartments) {
            $this->warn('Prodi baru:');
            $this->table(['Kode', 'Nama'], $newDepartments);
        }
        if ($perDepartment) {
            ksort($perDepartment);
            $this->table(['Homebase', 'Dosen baru'], collect($perDepartment)->map(fn ($count, $label) => [$label, $count])->values()->all());
        }
        if ($skipped) {
            $this->warn('Baris yang dilewati:');
            $this->table(['Nama', 'Nomor', 'Alasan'], $skipped);
        }
        $this->info($apply ? 'Perubahan DISIMPAN.' : 'Simulasi selesai; tidak ada perubahan yang disimpan. Jalankan dengan --apply untuk menyimpan.');

        return self::SUCCESS;
    }

    /** NIP 18 digit; bila kosong NUPTK, lalu No. Registrasi (NIDN/NIDK/NUP). */
    private function employeeNumber(array $item): ?string
    {
        foreach (['nip', 'nuptk', 'registrasi'] as $field) {
            $value = preg_replace('/[^0-9A-Za-z]/', '', (string) ($item[$field] ?? ''));
            if ($value !== '' && $value !== '0' && ! preg_match('/^0+$/', $value)) {
                return $value;
            }
        }

        return null;
    }

    private function resolveDepartment(string $penempatan, array $map, Collection $byKey, Collection $byCode): ?Department
    {
        if (isset($map[$penempatan])) {
            return $byCode->get(strtoupper((string) $map[$penempatan]));
        }

        return $byKey->get($this->key($penempatan)) ?? $byKey->get($this->key($this->departmentName($penempatan)));
    }

    /** "D3 - Teknik  Sipil" -> "D3 Teknik Sipil". */
    private function departmentName(string $penempatan): string
    {
        return trim(preg_replace('/\s+/', ' ', preg_replace('/\s+-\s+/', ' ', $penempatan, 1)));
    }

    private function key(string $name): string
    {
        return preg_replace('/[^a-z0-9]/', '', mb_strtolower($name));
    }

    /** Kode prodi dari jenjang + inisial kata, mis. "D4 - Akuntansi Manajerial" -> "D4-AM". */
    private function uniqueCode(string $penempatan, Collection $byCode): string
    {
        $name = $this->departmentName($penempatan);
        $words = preg_split('/\s+/', preg_replace('/[^A-Za-z0-9 ]/', ' ', $name));
        $level = strtoupper(array_shift($words) ?? 'PRODI');
        $stop = ['dan', 'untuk', 'kampus', 'kab', 'k', 'di', 'terapan'];
        $initials = collect($words)->filter(fn ($word) => $word !== '' && ! in_array(mb_strtolower($word), $stop, true))
            ->map(fn ($word) => strtoupper(mb_substr($word, 0, 1)))->implode('');
        $base = Str::limit($level.'-'.($initials ?: 'X'), 20, '');
        $code = $base;
        for ($suffix = 2; $byCode->has($code); $suffix++) {
            $code = $base.$suffix;
        }

        return $code;
    }
}
