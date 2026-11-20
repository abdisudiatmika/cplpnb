<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\CpmkCplMapping;
use App\Models\Curriculum;
use App\Models\Department;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Impor CPMK dan pemetaan CPMK-CPL dari file JSON (hasil olah dokumen CPMK prodi).
 *
 * Bobot kontribusi tiap CPMK diambil dari bobot pemetaan MK-CPL yang sudah ada dibagi jumlah
 * CPMK untuk CPL tersebut pada MK yang sama, sehingga skala bobot perhitungan CPL tidak berubah.
 * Pasangan MK-CPL yang baru (belum ada sebelumnya) memakai --default-weight.
 * Setelah impor, pemetaan MK-CPL MK terkait diturunkan ulang dari CPMK (sama seperti menu CPMK).
 */
class ImportCpmks extends Command
{
    protected $signature = 'cpmk:impor
        {file : Path file JSON berisi items[courseCode, code, description, cplCode, contributionWeight?]}
        {--department= : Kode, id, atau nama prodi (default: field "department" pada file)}
        {--curriculum= : Kode kurikulum tujuan (default: kurikulum aktif prodi)}
        {--default-weight=1 : Bobot untuk pasangan MK-CPL yang belum ada sebelumnya}
        {--apply : Simpan perubahan. Tanpa opsi ini hanya simulasi (rollback).}';

    protected $description = 'Impor CPMK dan pemetaan CPMK-CPL dari file JSON.';

    public function handle(): int
    {
        $path = $this->argument('file');
        $payload = is_file($path) ? json_decode(file_get_contents($path), true) : null;
        if (! is_array($payload) || ! is_array($payload['items'] ?? null)) {
            $this->error('File tidak ditemukan atau formatnya tidak valid.');

            return self::FAILURE;
        }

        $departmentKey = $this->option('department') ?: ($payload['department'] ?? null);
        $department = Department::where('id', $departmentKey)->orWhere('code', $departmentKey)->orWhere('name', $departmentKey)->first();
        if (! $department) {
            $this->error("Prodi '{$departmentKey}' tidak ditemukan.");

            return self::FAILURE;
        }

        $curriculum = Curriculum::where('department_id', $department->id)
            ->when($this->option('curriculum'), fn ($query, $code) => $query->where('code', $code))
            ->orderByDesc('is_default')->first();

        $apply = (bool) $this->option('apply');
        $defaultWeight = (float) $this->option('default-weight');
        $this->info(($apply ? 'MODE: APPLY' : 'MODE: SIMULASI').' | Prodi: '.$department->name.' | Kurikulum: '.($curriculum?->name ?? '(tanpa kurikulum)'));

        $items = collect($payload['items'])->map(fn ($item) => [
            'courseCode' => strtoupper(trim((string) ($item['courseCode'] ?? ''))),
            'courseName' => $item['courseName'] ?? null,
            'code' => strtoupper(trim((string) ($item['code'] ?? ''))),
            'description' => trim((string) ($item['description'] ?? '')),
            'cplCode' => strtoupper(trim((string) ($item['cplCode'] ?? ''))),
            'contributionWeight' => $item['contributionWeight'] ?? null,
        ]);

        $invalid = $items->filter(fn ($item) => ! preg_match('/^CPMK\d{2}-\d{2}$/', $item['code']) || ! preg_match('/^CPL-[1-9]\d*$/', $item['cplCode']) || $item['description'] === '' || $item['courseCode'] === '');
        if ($invalid->isNotEmpty()) {
            $this->error('Baris tidak valid: '.$invalid->map(fn ($item) => $item['courseCode'].'/'.$item['code'])->join(', '));

            return self::FAILURE;
        }

        $courseQuery = fn () => Course::where('department_id', $department->id)->when($curriculum, fn ($q) => $q->where('curriculum_id', $curriculum->id));
        $cplQuery = fn () => Cpl::where('department_id', $department->id)->when($curriculum, fn ($q) => $q->where('curriculum_id', $curriculum->id));
        $courses = $courseQuery()->whereIn('code', $items->pluck('courseCode')->unique())->get()->keyBy(fn ($course) => strtoupper($course->code));
        $cpls = $cplQuery()->whereIn('code', $items->pluck('cplCode')->unique())->get()->keyBy('code');

        $missingCourses = $items->pluck('courseCode')->unique()->reject(fn ($code) => $courses->has($code))->values();
        $missingCpls = $items->pluck('cplCode')->unique()->reject(fn ($code) => $cpls->has($code))->values();
        if ($missingCourses->isNotEmpty() || $missingCpls->isNotEmpty()) {
            if ($missingCourses->isNotEmpty()) {
                $this->error('MK tidak ditemukan pada prodi/kurikulum ini: '.$missingCourses->join(', '));
            }
            if ($missingCpls->isNotEmpty()) {
                $this->error('CPL tidak ditemukan pada prodi/kurikulum ini: '.$missingCpls->join(', '));
            }

            return self::FAILURE;
        }

        $nameWarnings = $items->unique('courseCode')->filter(fn ($item) => $item['courseName']
            && mb_strtolower(trim($courses->get($item['courseCode'])->name)) !== mb_strtolower(trim($item['courseName'])));
        foreach ($nameWarnings as $item) {
            $this->warn("Nama MK berbeda: {$item['courseCode']} di sistem '{$courses->get($item['courseCode'])->name}', di file '{$item['courseName']}'.");
        }

        $mappingChanges = [];
        $stats = ['cpmk_baru' => 0, 'cpmk_diperbarui' => 0, 'cpmk_lain_tetap' => 0];

        DB::beginTransaction();
        try {
            foreach ($items->groupBy('courseCode') as $courseCode => $courseItems) {
                $course = $courses->get($courseCode);
                $existingWeights = CourseCplMapping::where('course_id', $course->id)->get()->keyBy('cpl_id')->map(fn ($m) => (float) $m->weight);
                $before = $this->mappingSummary($course->id);

                foreach ($courseItems->groupBy('cplCode') as $cplCode => $cplItems) {
                    $cpl = $cpls->get($cplCode);
                    $pairWeight = $existingWeights->get($cpl->id, $defaultWeight);
                    foreach ($cplItems as $item) {
                        $cpmk = Cpmk::firstOrNew(['course_id' => $course->id, 'code' => $item['code']]);
                        $stats[$cpmk->exists ? 'cpmk_diperbarui' : 'cpmk_baru']++;
                        $cpmk->fill([
                            'description' => $item['description'],
                            'curriculum_version' => $curriculum?->code ?? $cpmk->curriculum_version,
                            'status' => 'Aktif',
                        ])->save();

                        $cpmk->cplMappings()->delete();
                        CpmkCplMapping::create([
                            'cpmk_id' => $cpmk->id,
                            'cpl_id' => $cpl->id,
                            'contribution_weight' => (float) ($item['contributionWeight'] ?? round($pairWeight / $cplItems->count(), 4)),
                        ]);
                    }
                }

                $stats['cpmk_lain_tetap'] += Cpmk::where('course_id', $course->id)->whereNotIn('code', $courseItems->pluck('code'))->count();
                $this->syncCourseMappings($course->id);
                $after = $this->mappingSummary($course->id);
                if ($before !== $after) {
                    $mappingChanges[] = [$courseCode, $course->name, $before ?: '-', $after ?: '-'];
                }
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

        $this->table(['Keterangan', 'Jumlah'], [
            ['Baris CPMK di file', $items->count()],
            ['MK', $items->pluck('courseCode')->unique()->count()],
            ['CPMK baru', $stats['cpmk_baru']],
            ['CPMK diperbarui', $stats['cpmk_diperbarui']],
            ['CPMK lain pada MK tersebut (tidak diubah)', $stats['cpmk_lain_tetap']],
            ['MK yang pemetaan MK-CPL-nya berubah', count($mappingChanges)],
        ]);
        if ($mappingChanges) {
            $this->warn('Perubahan pemetaan MK-CPL (kode x bobot):');
            $this->table(['Kode MK', 'Mata Kuliah', 'Sebelum', 'Sesudah'], $mappingChanges);
        }
        $this->info($apply ? 'Perubahan DISIMPAN.' : 'Simulasi selesai; tidak ada perubahan yang disimpan. Jalankan dengan --apply untuk menyimpan.');

        return self::SUCCESS;
    }

    private function mappingSummary(string $courseId): string
    {
        return CourseCplMapping::with('cpl')->where('course_id', $courseId)->get()
            ->sortBy(fn ($mapping) => (int) preg_replace('/\D/', '', (string) $mapping->cpl?->code))
            ->map(fn ($mapping) => $mapping->cpl?->code.'x'.rtrim(rtrim(number_format((float) $mapping->weight, 4, '.', ''), '0'), '.'))
            ->join(', ');
    }

    /**
     * Sama dengan CpmkController::syncCourseMappings: bobot MK-CPL = jumlah bobot kontribusi CPMK aktif.
     */
    private function syncCourseMappings(string $courseId): void
    {
        $derived = CpmkCplMapping::query()
            ->join('cpmks', 'cpmk_cpl_mappings.cpmk_id', '=', 'cpmks.id')
            ->where('cpmks.course_id', $courseId)
            ->where('cpmks.status', 'Aktif')
            ->groupBy('cpmk_cpl_mappings.cpl_id')
            ->selectRaw('cpmk_cpl_mappings.cpl_id, SUM(cpmk_cpl_mappings.contribution_weight) AS weight')
            ->get();

        CourseCplMapping::where('course_id', $courseId)->delete();
        foreach ($derived as $mapping) {
            CourseCplMapping::create(['course_id' => $courseId, 'cpl_id' => $mapping->cpl_id, 'weight' => (float) $mapping->weight]);
        }
    }
}
