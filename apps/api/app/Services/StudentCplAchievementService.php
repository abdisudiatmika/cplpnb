<?php

namespace App\Services;

use App\Console\Commands\MigrateLegacyGrades;
use App\Models\AssessmentPlan;
use App\Models\Cpmk;
use App\Models\StudentAssessmentScore;
use App\Models\StudentCpmkScore;
use App\Models\StudentGrade;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Satu-satunya tempat perhitungan capaian CPMK dan CPL mahasiswa.
 *
 * Sumber nilai per mata kuliah, dari prioritas tertinggi:
 *  1. Buku nilai dosen (rencana asesmen OBE) yang sudah dikunci.
 *  2. Nilai per CPMK yang diinput admin prodi (student_cpmk_scores).
 *  3. Nilai satuan mata kuliah (student_grades, termasuk data lama). Nilai ini diberikan
 *     sama ke setiap CPMK aktif mata kuliah tersebut. Bila mata kuliah belum punya CPMK
 *     yang terpetakan ke CPL, dipakai pemetaan mata kuliah -> CPL dengan bobot dibagi rata.
 *
 * Bobot CPMK -> CPL diisi admin prodi per mata kuliah (CpmkWeightBalancer, maks. total 100%), sehingga setiap mata
 * kuliah menyumbang total 100% yang terbagi ke CPL-CPL yang didukungnya.
 *
 * Bila dosen sudah memberi nilai untuk mahasiswa pada sebuah mata kuliah, nilai admin
 * untuk mata kuliah itu diabaikan. Nilai CPMK admin menggantikan nilai satuan hanya pada
 * CPMK yang diisi.
 *
 * Rencana asesmen hasil perintah nilai:migrasi-lama hanyalah salinan student_grades dengan
 * pemetaan yang sama, sehingga diabaikan di sini; dengan begitu perubahan nilai satuan oleh
 * admin tetap berlaku untuk mata kuliah yang pernah dimigrasi.
 */
class StudentCplAchievementService
{
    public const SOURCE_DOSEN = 'dosen';
    public const SOURCE_ADMIN_CPMK = 'admin_cpmk';
    public const SOURCE_SINGLE = 'nilai_satuan';

    /**
     * Rincian nilai CPMK yang dipakai untuk menghitung CPL mahasiswa.
     */
    public function details(Collection $students, ?string $semesterType = null, ?string $academicYear = null): Collection
    {
        $result = [];
        foreach ($this->collectEntries($students, $semesterType, $academicYear) as $studentId => $entries) {
            foreach ($entries as $entry) {
                if (! $entry['cpmk']) {
                    continue;
                }
                $result[$studentId][] = [
                    'cpmkId' => $entry['cpmk']->id,
                    'cpmkCode' => $entry['cpmk']->code,
                    'description' => $entry['cpmk']->description,
                    'courseCode' => $entry['courseCode'],
                    'courseName' => $entry['courseName'],
                    'className' => $entry['className'],
                    'period' => $entry['period'],
                    'score' => $entry['score'],
                    'status' => $entry['score'] >= 75 ? 'Tercapai' : 'Belum Tercapai',
                    'source' => $entry['source'],
                    'cpls' => collect($entry['cpls'])
                        ->map(fn ($cpl) => ['code' => $cpl['code'], 'weight' => $cpl['weight']])
                        ->filter(fn ($cpl) => $cpl['code'])
                        ->values()->all(),
                ];
            }
        }

        return collect($result)->map(fn ($rows) => collect($rows)->sortBy('cpmkCode')->values());
    }

    /**
     * Nilai CPL per mahasiswa: [student_id => Collection[cpl_id => nilai]].
     */
    public function calculate(Collection $students, ?string $semesterType = null, ?string $academicYear = null): Collection
    {
        $studentIds = $students->pluck('id')->filter()->values();
        if ($studentIds->isEmpty()) {
            return collect();
        }

        $buckets = [];
        foreach ($this->collectEntries($students, $semesterType, $academicYear) as $studentId => $entries) {
            foreach ($entries as $entry) {
                foreach ($entry['cpls'] as $cpl) {
                    if ($cpl['weight'] <= 0) {
                        continue;
                    }
                    $buckets[$studentId][$cpl['id']][] = ['score' => $entry['score'], 'weight' => $cpl['weight']];
                }
            }
        }

        return $studentIds->mapWithKeys(function ($studentId) use ($buckets) {
            $scores = collect($buckets[$studentId] ?? [])->map(function ($entries) {
                $entries = collect($entries);
                $weight = (float) $entries->sum('weight');

                return $weight > 0
                    ? round((float) $entries->sum(fn ($entry) => $entry['score'] * $entry['weight']) / $weight, 2)
                    : null;
            })->filter(fn ($value) => $value !== null);

            return [$studentId => $scores];
        });
    }

    /**
     * Nilai akhir mata kuliah (skala 0-100): buku nilai dosen yang dikunci (berbobot komponen),
     * atau rata-rata nilai CPMK dari input admin/nilai satuan. Hasil: [course_id => [student_id => nilai]].
     */
    public function courseFinalScores(Collection $students, ?string $semesterType = null, ?string $academicYear = null): Collection
    {
        $studentIds = $students->pluck('id')->filter()->values();
        if ($studentIds->isEmpty()) {
            return collect();
        }

        // Nilai admin: rata-rata nilai CPMK mata kuliah (CPMK yang tidak diisi memakai nilai satuan).
        $result = [];
        foreach ($this->collectEntries($students, $semesterType, $academicYear) as $studentId => $entries) {
            foreach (collect($entries)->where('source', '!=', self::SOURCE_DOSEN)->groupBy('courseId') as $courseId => $rows) {
                $result[$courseId][$studentId] = round((float) $rows->avg('score'), 2);
            }
        }

        foreach ($this->lockedPlans($studentIds, $semesterType, $academicYear, ['items']) as $plan) {
            $courseId = $plan->courseOffering?->course_id;
            if (! $courseId) {
                continue;
            }
            foreach ($plan->courseOffering->enrollments as $enrollment) {
                $scores = $enrollment->scores->keyBy('assessment_item_id');
                $complete = $plan->items->where('is_required', true)
                    ->every(fn ($item) => $this->scoreIsComplete($scores->get($item->id)));
                if (! $complete || $plan->items->isEmpty()) {
                    continue;
                }

                $result[$courseId][$enrollment->student_id] = round((float) $plan->items->sum(
                    fn ($item) => (float) ($scores->get($item->id)?->score ?? 0) * (float) $item->weight / 100
                ), 2);
            }
        }

        return collect($result)->map(fn ($rows) => collect($rows));
    }

    /**
     * Mata kuliah yang sudah dinilai dosen (buku nilai dikunci, komponen wajib lengkap),
     * tanpa filter periode: [student_id => [course_id => true]].
     */
    public function dosenGradedCourses(Collection $students): array
    {
        $result = [];
        foreach ($this->dosenEntries($students->pluck('id')->filter()->values(), null, null) as $studentId => $entries) {
            foreach ($entries as $entry) {
                $result[$studentId][$entry['courseId']] = true;
            }
        }

        return $result;
    }

    /**
     * Nilai angka 0-100 dari baris student_grades (skala 0-10 dikonversi, nilai 0 memakai huruf).
     */
    public function legacyScore($score, $grade): float
    {
        if ($score !== null && $score !== '' && (float) $score > 0) {
            return (float) $score <= 10 ? (float) $score * 10 : (float) $score;
        }

        return $this->gradeToPercent($grade);
    }

    public function gradeToPercent($grade): float
    {
        return match ($grade) {
            'A' => 95, 'A-' => 90, 'AB', 'B+' => 85, 'B', 'B-' => 75,
            'C+' => 70, 'BC' => 65, 'C' => 60, 'D' => 50,
            default => 0,
        };
    }

    /** Huruf mutu untuk nilai angka 0-100, sama dengan skala di aplikasi web. */
    public function letterForScore(float $score): string
    {
        return match (true) {
            $score >= 81 => 'A',
            $score >= 76 => 'AB',
            $score >= 66 => 'B',
            $score >= 61 => 'BC',
            $score >= 56 => 'C',
            $score >= 41 => 'D',
            default => 'E',
        };
    }

    /** Percobaan terakhir dari beberapa nilai satuan mahasiswa untuk mata kuliah yang sama. */
    public function latestAttempt(Collection $attempts)
    {
        return $attempts
            ->sortByDesc(fn ($grade) => sprintf('%02d-%s-%s', $this->semesterToNumber($grade->semester) ?? 0, $grade->academic_year, $grade->updated_at))
            ->first();
    }

    /**
     * Apakah nilai bersemester $gradeSemester (nomor semester mahasiswa) termasuk periode filter.
     */
    public function matchesAcademicPeriod($gradeSemester, $angkatan, ?string $semesterType = null, ?string $academicYear = null): bool
    {
        if (! $semesterType && ! $academicYear) {
            return true;
        }

        $semesterNumber = $this->semesterToNumber($gradeSemester);
        if ($semesterNumber === null) {
            return true;
        }

        $period = strtolower(trim((string) $semesterType));
        if ($period === 'ganjil' && $semesterNumber % 2 === 0) {
            return false;
        }
        if ($period === 'genap' && $semesterNumber % 2 !== 0) {
            return false;
        }

        if (! $academicYear) {
            return true;
        }

        $currentSemester = $this->currentSemesterForCohort($angkatan, $academicYear, $period);

        return $currentSemester === null || $semesterNumber === $currentSemester;
    }

    public function currentSemesterForCohort($angkatan, $academicYear, $semesterType = null): ?int
    {
        if (! $angkatan || ! preg_match('/^\d{4}/', (string) $academicYear, $matches)) {
            return null;
        }

        $academicStartYear = (int) $matches[0];
        $cohortYear = (int) $angkatan;
        if ($cohortYear > $academicStartYear) {
            return 0;
        }

        $period = strtolower(trim((string) $semesterType));
        $semesterOffset = $period === 'ganjil' ? 1 : 2;

        return max(0, (($academicStartYear - $cohortYear) * 2) + $semesterOffset);
    }

    public function semesterToNumber($semester): ?int
    {
        $value = strtoupper(trim((string) $semester));
        if ($value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }

        return ['I' => 1, 'II' => 2, 'III' => 3, 'IV' => 4, 'V' => 5, 'VI' => 6, 'VII' => 7, 'VIII' => 8][$value] ?? null;
    }

    /** Tahun ajaran saat angkatan menempuh semester ke-n, misalnya angkatan 2024 semester 3 -> 2025/2026. */
    public function academicYearForSemester($angkatan, $semester): ?string
    {
        $number = $this->semesterToNumber($semester);
        if (! $number || ! is_numeric($angkatan)) {
            return null;
        }
        $start = (int) $angkatan + intdiv($number - 1, 2);

        return $start.'/'.($start + 1);
    }

    /**
     * Semua nilai CPMK (dan cadangan per mata kuliah) per mahasiswa setelah prioritas sumber diterapkan.
     *
     * @return array<string, array<int, array>> student_id => daftar entri
     */
    private function collectEntries(Collection $students, ?string $semesterType, ?string $academicYear): array
    {
        $studentIds = $students->pluck('id')->filter()->values();
        if ($studentIds->isEmpty()) {
            return [];
        }
        $studentsById = $students->keyBy('id');

        $entries = $this->dosenEntries($studentIds, $semesterType, $academicYear);
        $dosenCourses = [];
        foreach ($entries as $studentId => $rows) {
            foreach ($rows as $row) {
                $dosenCourses[$studentId][$row['courseId']] = true;
            }
        }

        // 2. Nilai per CPMK dari admin.
        $adminCpmks = [];
        foreach ($this->adminCpmkRows($students, $semesterType, $academicYear) as $row) {
            if (isset($dosenCourses[$row->student_id][$row->course_id]) || ! $row->cpmk) {
                continue;
            }
            $adminCpmks[$row->student_id][$row->cpmk_id] = true;
            $entries[$row->student_id][] = $this->entry(
                self::SOURCE_ADMIN_CPMK,
                $row->course,
                $row->cpmk,
                (float) $row->score,
                $studentsById->get($row->student_id)?->kelas,
                $this->periodLabel($row->semester, $row->academic_year),
                $this->cpmkCpls($row->cpmk)
            );
        }

        // 3. Nilai satuan mata kuliah, dibagikan ke CPMK aktif mata kuliah tersebut.
        $grades = StudentGrade::with([
            'course.cpmks' => fn ($query) => $query->where('status', 'Aktif')->with('cplMappings.cpl')->orderBy('code'),
        ])
            ->whereIn('student_id', $studentIds)
            ->where('grade', '!=', 'Belum Diambil')
            ->get()
            // Bila mata kuliah diulang, yang dipakai percobaan terakhir (semester tertinggi).
            ->groupBy(fn ($grade) => $grade->student_id.'|'.$grade->course_id)
            ->map(fn ($attempts) => $this->latestAttempt($attempts))
            ->filter(fn ($grade) => $this->matchesAcademicPeriod(
                $grade->semester,
                $studentsById->get($grade->student_id)?->angkatan,
                $semesterType,
                $academicYear
            ));

        $fallbackCourseIds = [];
        foreach ($grades as $grade) {
            if (! $grade->course || isset($dosenCourses[$grade->student_id][$grade->course_id])) {
                continue;
            }
            $score = $this->legacyScore($grade->score, $grade->grade);
            $period = $this->periodLabel($grade->semester, $grade->academic_year);
            $kelas = $studentsById->get($grade->student_id)?->kelas;
            $mappedCpmks = $grade->course->cpmks->filter(fn ($cpmk) => count($this->cpmkCpls($cpmk)) > 0);

            if ($mappedCpmks->isEmpty()) {
                $fallbackCourseIds[$grade->course_id] = true;
                $entries[$grade->student_id][] = $this->entry(self::SOURCE_SINGLE, $grade->course, null, $score, $kelas, $period, [], $grade->course_id);

                continue;
            }

            foreach ($mappedCpmks as $cpmk) {
                if (isset($adminCpmks[$grade->student_id][$cpmk->id])) {
                    continue;
                }
                $entries[$grade->student_id][] = $this->entry(self::SOURCE_SINGLE, $grade->course, $cpmk, $score, $kelas, $period, $this->cpmkCpls($cpmk));
            }
        }

        // Mata kuliah tanpa CPMK terpetakan memakai pemetaan mata kuliah -> CPL, dengan 100%
        // dibagi rata ke CPL yang terpetakan (sama seperti pembagian rata bobot CPMK).
        if ($fallbackCourseIds) {
            $courseCpls = DB::table('course_cpl_mappings')
                ->join('cpls', 'course_cpl_mappings.cpl_id', '=', 'cpls.id')
                ->whereIn('course_cpl_mappings.course_id', array_keys($fallbackCourseIds))
                ->where('course_cpl_mappings.weight', '>', 0)
                ->select('course_cpl_mappings.course_id', 'course_cpl_mappings.cpl_id', 'cpls.code')
                ->get()
                ->groupBy('course_id')
                ->map(function ($maps) {
                    $share = round(100 / $maps->count(), 4);

                    return $maps->map(fn ($map) => ['id' => $map->cpl_id, 'code' => $map->code, 'weight' => $share])->values()->all();
                });
            foreach ($entries as $studentId => $rows) {
                foreach ($rows as $index => $row) {
                    if ($row['fallbackCourseId']) {
                        $entries[$studentId][$index]['cpls'] = $courseCpls->get($row['fallbackCourseId'], []);
                    }
                }
            }
        }

        return $entries;
    }

    /** @return array<string, array<int, array>> */
    private function dosenEntries(Collection $studentIds, ?string $semesterType, ?string $academicYear): array
    {
        if ($studentIds->isEmpty()) {
            return [];
        }

        $entries = [];
        $plans = $this->lockedPlans($studentIds, $semesterType, $academicYear, [
            'items.cpmk.cplMappings.cpl',
            'courseOffering.course',
            'courseOffering.academicClass',
        ]);
        foreach ($plans as $plan) {
            $offering = $plan->courseOffering;
            $period = $offering->academicPeriod
                ? trim(($offering->academicPeriod->semester ?? '').' '.($offering->academicPeriod->academic_year ?? ''))
                : null;
            foreach ($offering->enrollments as $enrollment) {
                $scores = $enrollment->scores->keyBy('assessment_item_id');
                foreach ($plan->items->groupBy('cpmk_id') as $items) {
                    $complete = $items->where('is_required', true)
                        ->every(fn ($item) => $this->scoreIsComplete($scores->get($item->id)));
                    $weight = (float) $items->sum('weight');
                    $cpmk = $items->first()?->cpmk;
                    if (! $complete || $weight <= 0 || ! $cpmk) {
                        continue;
                    }

                    $score = round((float) $items->sum(
                        fn ($item) => (float) ($scores->get($item->id)?->score ?? 0) * (float) $item->weight
                    ) / $weight, 2);

                    $entries[$enrollment->student_id][] = $this->entry(
                        self::SOURCE_DOSEN,
                        $offering->course,
                        $cpmk,
                        $score,
                        $offering->academicClass?->name,
                        $period,
                        $this->cpmkCpls($cpmk),
                        null,
                        $offering->course_id
                    );
                }
            }
        }

        return $entries;
    }

    private function adminCpmkRows(Collection $students, ?string $semesterType, ?string $academicYear): Collection
    {
        $studentsById = $students->keyBy('id');

        return StudentCpmkScore::with(['course', 'cpmk.cplMappings.cpl'])
            ->whereIn('student_id', $studentsById->keys())
            ->get()
            ->filter(fn ($row) => $this->matchesAcademicPeriod(
                $row->semester,
                $studentsById->get($row->student_id)?->angkatan,
                $semesterType,
                $academicYear
            ))
            ->values();
    }

    private function entry(string $source, $course, ?Cpmk $cpmk, float $score, ?string $className, ?string $period, array $cpls, ?string $fallbackCourseId = null, ?string $courseId = null): array
    {
        return [
            'source' => $source,
            'courseId' => $courseId ?? $course?->id,
            'courseCode' => $course?->code,
            'courseName' => $course?->name,
            'cpmk' => $cpmk,
            'score' => round($score, 2),
            'className' => $className,
            'period' => $period,
            'cpls' => $cpls,
            'fallbackCourseId' => $fallbackCourseId,
        ];
    }

    /** @return array<int, array{id: string, code: ?string, weight: float}> */
    private function cpmkCpls(Cpmk $cpmk): array
    {
        return $cpmk->cplMappings
            ->filter(fn ($mapping) => (float) $mapping->contribution_weight > 0)
            ->map(fn ($mapping) => [
                'id' => $mapping->cpl_id,
                'code' => $mapping->cpl?->code,
                'weight' => (float) $mapping->contribution_weight,
            ])->values()->all();
    }

    private function periodLabel($semester, $academicYear): ?string
    {
        $number = $this->semesterToNumber($semester);
        $type = $number ? ($number % 2 === 1 ? 'Ganjil' : 'Genap') : null;
        $label = trim(($type ?? '').' '.($academicYear ?? ''));

        return $label !== '' ? $label : null;
    }

    private function lockedPlans(Collection $studentIds, ?string $semesterType, ?string $academicYear, array $with): Collection
    {
        $normalizedSemester = strtolower(trim((string) $semesterType));

        return AssessmentPlan::with(array_merge(['items'], $with, [
            'gradeSubmission',
            'courseOffering.academicPeriod',
            'courseOffering.enrollments' => fn ($query) => $query
                ->whereIn('student_id', $studentIds)
                ->where('enrollment_status', 'active')
                ->with('scores'),
        ]))
            ->where('status', 'Published')
            ->whereHas('courseOffering.enrollments', fn ($query) => $query
                ->whereIn('student_id', $studentIds)
                ->where('enrollment_status', 'active'))
            ->when(in_array($normalizedSemester, ['ganjil', 'genap'], true), fn ($query) => $query
                ->whereHas('courseOffering.academicPeriod', fn ($period) => $period
                    ->where('semester', ucfirst($normalizedSemester))))
            ->when($academicYear, fn ($query) => $query
                ->whereHas('courseOffering.academicPeriod', fn ($period) => $period
                    ->where('academic_year', $academicYear)))
            ->get()
            ->groupBy('course_offering_id')
            ->map(fn ($versions) => $versions->sortByDesc(fn ($plan) => (int) $plan->version)->first())
            ->filter(fn ($plan) => $plan->gradeSubmission?->status === 'Locked')
            ->reject(fn ($plan) => $this->isLegacyMigrationPlan($plan));
    }

    /** Rencana yang seluruh komponennya dibuat oleh nilai:migrasi-lama (salinan student_grades). */
    private function isLegacyMigrationPlan(AssessmentPlan $plan): bool
    {
        return $plan->items->isNotEmpty()
            && $plan->items->every(fn ($item) => $item->name === MigrateLegacyGrades::ITEM_NAME);
    }

    private function scoreIsComplete(?StudentAssessmentScore $score): bool
    {
        if (! $score) {
            return false;
        }
        if (in_array($score->eligibility_status, ['not_eligible_attendance', 'absent'], true)) {
            return true;
        }

        return $score->eligibility_status === 'eligible' && $score->score !== null;
    }
}
