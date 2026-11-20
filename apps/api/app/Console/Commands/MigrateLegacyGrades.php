<?php

namespace App\Console\Commands;

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
use App\Models\CpmkCplMapping;
use App\Models\GradeAuditLog;
use App\Models\GradeSubmission;
use App\Models\Student;
use App\Models\StudentAssessmentScore;
use App\Services\StudentCplAchievementService;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Memindahkan nilai akhir lama (student_grades) ke format OBE v2.
 *
 * Untuk setiap nilai lama dibuat periode, kelas, penawaran MK, rencana asesmen terkunci,
 * dan skor komponen. Nilai akhir diisikan ke SEMUA komponen sehingga hasil berbobotnya
 * tetap sama dengan nilai akhir lama. MK yang belum memiliki CPMK dibuatkan satu CPMK
 * migrasi per CPL yang terpetakan, dengan bobot kontribusi = bobot pemetaan MK-CPL lama,
 * sehingga capaian CPL hasil hitung baru sama dengan perhitungan lama.
 *
 * Tabel student_grades tidak diubah. Tanpa --apply, semua perubahan dibatalkan (simulasi).
 */
class MigrateLegacyGrades extends Command
{
    public const ITEM_NAME = 'Nilai Akhir (migrasi nilai lama)';

    protected $signature = 'nilai:migrasi-lama
        {--apply : Simpan perubahan. Tanpa opsi ini hanya simulasi (rollback).}
        {--department= : Batasi ke satu prodi (id atau kode prodi).}';

    protected $description = 'Migrasi nilai akhir lama ke komponen asesmen OBE (nilai akhir tetap sama).';

    private array $stats = [];

    public function handle(StudentCplAchievementService $achievements): int
    {
        $apply = (bool) $this->option('apply');
        $this->stats = [
            'nilai_lama' => 0, 'dimigrasi' => 0, 'lewati_belum_diambil' => 0, 'lewati_percobaan_lama' => 0,
            'lewati_tanpa_cpl' => 0, 'lewati_angkatan_tidak_valid' => 0, 'lewati_semester_tidak_valid' => 0,
            'lewati_ada_nilai_dosen' => 0, 'cpmk_otomatis' => 0, 'periode_baru' => 0, 'kelas_baru' => 0,
            'penawaran_baru' => 0, 'rencana_baru' => 0,
        ];

        $this->info($apply ? 'MODE: APPLY (perubahan akan disimpan)' : 'MODE: SIMULASI (semua perubahan dibatalkan)');

        $students = Student::query()
            ->when($this->option('department'), function ($query, $department) {
                $query->whereHas('department', fn ($q) => $q->where('id', $department)->orWhere('code', $department));
            })
            ->get()
            ->keyBy('id');

        $before = $this->legacyCplValues($students);

        DB::beginTransaction();
        try {
            $this->migrate($students);
            $mismatches = $this->verify($students, $before, $achievements);

            if ($apply && $mismatches === 0) {
                DB::commit();
                $this->info('Perubahan DISIMPAN.');
            } else {
                DB::rollBack();
                $this->warn($apply
                    ? 'Perubahan DIBATALKAN karena ada selisih capaian CPL. Periksa laporan di atas.'
                    : 'Simulasi selesai; tidak ada perubahan yang disimpan. Jalankan dengan --apply untuk menyimpan.');
            }
        } catch (\Throwable $exception) {
            DB::rollBack();
            $this->error('Gagal: '.$exception->getMessage());

            return self::FAILURE;
        }

        $this->table(['Keterangan', 'Jumlah'], collect($this->stats)->map(fn ($value, $key) => [str_replace('_', ' ', $key), $value])->values()->all());

        return ($apply && $mismatches > 0) ? self::FAILURE : self::SUCCESS;
    }

    private function migrate(Collection $students): void
    {
        $grades = DB::table('student_grades')->whereIn('student_id', $students->keys())->get();
        $this->stats['nilai_lama'] = $grades->count();

        // Satu nilai per mahasiswa per MK, sama seperti perhitungan lama; bila ada pengulangan, ambil periode terbaru.
        $chosen = $grades
            ->reject(function ($grade) {
                if ($grade->grade === 'Belum Diambil') {
                    $this->stats['lewati_belum_diambil']++;

                    return true;
                }

                return false;
            })
            ->groupBy(fn ($grade) => $grade->student_id.'|'.$grade->course_id)
            ->map(function (Collection $attempts) {
                $this->stats['lewati_percobaan_lama'] += $attempts->count() - 1;

                return $attempts->sortByDesc(fn ($grade) => sprintf('%s-%02d', $grade->academic_year, $this->semesterNumber($grade->semester) ?? 0))->first();
            });

        $courses = Course::with('curriculum')->whereIn('id', $chosen->pluck('course_id')->unique())->get()->keyBy('id');
        $cpmksByCourse = [];

        foreach ($chosen->groupBy('course_id') as $courseId => $courseGrades) {
            $course = $courses->get($courseId);
            if (! $course) {
                continue;
            }

            $cpmks = $cpmksByCourse[$courseId] ??= $this->ensureCpmks($course);
            if ($cpmks->isEmpty()) {
                $this->stats['lewati_tanpa_cpl'] += $courseGrades->count();

                continue;
            }

            foreach ($courseGrades as $grade) {
                $this->migrateGrade($grade, $students->get($grade->student_id), $course, $cpmks);
            }
        }
    }

    private function migrateGrade(object $grade, Student $student, Course $course, Collection $cpmks): void
    {
        if (! is_numeric($student->angkatan)) {
            $this->stats['lewati_angkatan_tidak_valid']++;

            return;
        }
        $semesterNumber = $this->semesterNumber($grade->semester);
        if (! $semesterNumber || ! preg_match('/^\d{4}\/\d{4}$/', (string) $grade->academic_year)) {
            $this->stats['lewati_semester_tidak_valid']++;

            return;
        }

        $period = AcademicPeriod::firstOrCreate(
            ['department_id' => $student->department_id, 'academic_year' => $grade->academic_year, 'semester' => $semesterNumber % 2 === 1 ? 'Ganjil' : 'Genap'],
            ['status' => 'Selesai']
        );
        $this->stats['periode_baru'] += $period->wasRecentlyCreated ? 1 : 0;

        $class = AcademicClass::firstOrCreate(
            ['department_id' => $student->department_id, 'name' => $student->kelas ?: '-', 'cohort_year' => (int) $student->angkatan],
            ['status' => 'Aktif']
        );
        $this->stats['kelas_baru'] += $class->wasRecentlyCreated ? 1 : 0;

        $offering = CourseOffering::firstOrCreate(
            ['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id],
            ['status' => 'Selesai']
        );
        $this->stats['penawaran_baru'] += $offering->wasRecentlyCreated ? 1 : 0;

        $plans = AssessmentPlan::with('items')->where('course_offering_id', $offering->id)->get();
        $plan = $plans->first(fn (AssessmentPlan $candidate) => $candidate->items->isNotEmpty()
            && $candidate->items->every(fn ($item) => $item->name === self::ITEM_NAME));

        if (! $plan && $plans->isNotEmpty()) {
            // Kelas ini sudah memakai rencana asesmen dosen; nilai lama tidak menimpanya.
            $this->stats['lewati_ada_nilai_dosen']++;

            return;
        }

        if (! $plan) {
            $plan = $this->createLockedPlan($offering, $cpmks);
        }

        $enrollment = CourseEnrollment::firstOrCreate(
            ['course_offering_id' => $offering->id, 'student_id' => $student->id],
            ['enrollment_status' => 'active']
        );

        $score = $this->legacyScore($grade);
        foreach ($plan->items as $item) {
            StudentAssessmentScore::updateOrCreate(
                ['course_enrollment_id' => $enrollment->id, 'assessment_item_id' => $item->id],
                [
                    'score' => $score,
                    'eligibility_status' => 'eligible',
                    'note' => sprintf('Migrasi nilai lama: huruf %s, skor %s.', $grade->grade, $grade->score ?? '-'),
                    'entered_at' => now(),
                ]
            );
        }

        $this->stats['dimigrasi']++;
    }

    private function createLockedPlan(CourseOffering $offering, Collection $cpmks): AssessmentPlan
    {
        $plan = AssessmentPlan::create([
            'course_offering_id' => $offering->id,
            'version' => (int) AssessmentPlan::where('course_offering_id', $offering->id)->max('version') + 1,
            'status' => 'Published',
            'published_at' => now(),
        ]);

        // Bobot dibagi rata dan totalnya tepat 100; karena semua komponen bernilai sama, hasil akhirnya = nilai lama.
        $count = $cpmks->count();
        $base = floor(10000 / $count) / 100;
        foreach ($cpmks->values() as $index => $cpmk) {
            AssessmentItem::create([
                'assessment_plan_id' => $plan->id,
                'cpmk_id' => $cpmk->id,
                'category' => 'final',
                'name' => self::ITEM_NAME,
                'weight' => $index === $count - 1 ? round(100 - $base * ($count - 1), 2) : $base,
                'sequence' => $index + 1,
                'is_required' => true,
            ]);
        }

        GradeSubmission::create(['assessment_plan_id' => $plan->id, 'status' => 'Locked', 'locked_at' => now()]);
        GradeAuditLog::create(['assessment_plan_id' => $plan->id, 'action' => 'migrated', 'reason' => 'Dibuat otomatis dari nilai akhir lama (student_grades).']);
        $this->stats['rencana_baru']++;

        return $plan->load('items');
    }

    /**
     * CPMK aktif MK; bila belum ada, dibuat satu CPMK per CPL yang terpetakan pada MK tersebut.
     */
    private function ensureCpmks(Course $course): Collection
    {
        $existing = Cpmk::where('course_id', $course->id)->where('status', 'Aktif')->orderBy('code')->get();
        if ($existing->isNotEmpty()) {
            return $existing;
        }

        $mappings = CourseCplMapping::with('cpl')->where('course_id', $course->id)->get()
            ->filter(fn ($mapping) => $mapping->cpl && (float) $mapping->weight > 0);

        $created = collect();
        foreach ($mappings->sortBy(fn ($mapping) => (int) preg_replace('/\D/', '', $mapping->cpl->code)) as $mapping) {
            $number = (int) preg_replace('/\D/', '', $mapping->cpl->code);
            $cpmk = Cpmk::create([
                'course_id' => $course->id,
                'code' => sprintf('CPMK%02d-01', min(99, $number)),
                'description' => sprintf('CPMK %s yang mendukung %s (dibuat otomatis saat migrasi nilai lama; silakan sesuaikan).', $course->name, $mapping->cpl->code),
                'curriculum_version' => $course->curriculum?->code,
                'status' => 'Aktif',
            ]);
            CpmkCplMapping::create(['cpmk_id' => $cpmk->id, 'cpl_id' => $mapping->cpl_id, 'contribution_weight' => (float) $mapping->weight]);
            $created->push($cpmk);
            $this->stats['cpmk_otomatis']++;
        }

        return $created;
    }

    /**
     * Konversi skor sama dengan perhitungan CPL lama.
     */
    private function legacyScore(object $grade): float
    {
        $score = $grade->score;
        if ($score !== null && (float) $score > 0) {
            $value = (float) $score <= 10 ? (float) $score * 10 : (float) $score;
        } else {
            $value = match ($grade->grade) {
                'A' => 95, 'AB' => 85, 'A-' => 90, 'B+' => 85, 'B' => 75, 'BC' => 65,
                'B-' => 75, 'C+' => 70, 'C' => 60, 'D' => 50, default => 0,
            };
        }

        return round(min(100, max(0, $value)), 2);
    }

    private function semesterNumber($semester): ?int
    {
        $value = strtoupper(trim((string) $semester));
        if (is_numeric($value)) {
            return (int) $value ?: null;
        }

        return ['I' => 1, 'II' => 2, 'III' => 3, 'IV' => 4, 'V' => 5, 'VI' => 6, 'VII' => 7, 'VIII' => 8][$value] ?? null;
    }

    /**
     * Capaian CPL per mahasiswa dengan rumus lama (rata-rata berbobot pemetaan MK-CPL).
     */
    private function legacyCplValues(Collection $students): array
    {
        $grades = DB::table('student_grades')->whereIn('student_id', $students->keys())
            ->where('grade', '!=', 'Belum Diambil')->get()
            ->groupBy('student_id')
            ->map(fn ($rows) => $rows->groupBy('course_id')->map(fn ($attempts) => $attempts
                ->sortByDesc(fn ($grade) => sprintf('%s-%02d', $grade->academic_year, $this->semesterNumber($grade->semester) ?? 0))->first()));
        $mappings = CourseCplMapping::whereIn('course_id', DB::table('student_grades')->whereIn('student_id', $students->keys())->distinct()->pluck('course_id'))
            ->get()->groupBy('cpl_id');

        $values = [];
        foreach ($grades as $studentId => $byCourse) {
            foreach ($mappings as $cplId => $cplMappings) {
                $sum = 0;
                $weight = 0;
                foreach ($cplMappings as $mapping) {
                    $grade = $byCourse->get($mapping->course_id);
                    if ($grade && (float) $mapping->weight > 0) {
                        $sum += $this->legacyScore($grade) * (float) $mapping->weight;
                        $weight += (float) $mapping->weight;
                    }
                }
                if ($weight > 0) {
                    $values[$studentId][$cplId] = round($sum / $weight, 2);
                }
            }
        }

        return $values;
    }

    private function verify(Collection $students, array $before, StudentCplAchievementService $achievements): int
    {
        $after = $achievements->calculate($students->values());
        $mismatches = 0;
        $examples = [];
        foreach ($before as $studentId => $cpls) {
            foreach ($cpls as $cplId => $legacyValue) {
                $newValue = $after->get($studentId)?->get($cplId);
                if ($newValue === null || abs((float) $newValue - $legacyValue) > 0.05) {
                    $mismatches++;
                    if (count($examples) < 10) {
                        $examples[] = [$students->get($studentId)?->nim, Cpl::find($cplId)?->code, $legacyValue, $newValue ?? '-'];
                    }
                }
            }
        }

        $checked = collect($before)->sum(fn ($cpls) => count($cpls));
        $this->stats['cpl_diverifikasi'] = $checked;
        $this->stats['cpl_selisih'] = $mismatches;
        if ($mismatches > 0) {
            $this->warn("Ditemukan {$mismatches} capaian CPL yang berbeda dari perhitungan lama (contoh):");
            $this->table(['NIM', 'CPL', 'Lama', 'Baru'], $examples);
        } else {
            $this->info("Verifikasi: {$checked} capaian CPL mahasiswa sama persis dengan perhitungan lama.");
        }

        return $mismatches;
    }
}
