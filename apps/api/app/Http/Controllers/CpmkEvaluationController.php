<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\Student;
use App\Services\StudentCplAchievementService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Laporan evaluasi CPMK per mata kuliah (evaluasi formatif OBE tiap semester).
 *
 * Per CPMK dihitung dari nilai CPMK mahasiswa (sumber sama dengan perhitungan CPL: buku nilai dosen
 * yang dikunci, nilai CPMK admin, atau nilai satuan yang dibagikan ke CPMK):
 *  - rata-rata, minimum, maksimum;
 *  - jumlah dan persentase mahasiswa dengan nilai >= MIN_SCORE;
 *  - status "Tercapai" bila persentase tersebut >= MIN_PERCENT.
 */
class CpmkEvaluationController extends Controller
{
    public const MIN_SCORE = 75.0;
    public const MIN_PERCENT = 70.0;

    public function __construct(private StudentCplAchievementService $achievements) {}

    /** Ringkasan semua mata kuliah yang punya CPMK aktif. */
    public function index(Request $request)
    {
        $departmentId = $this->departmentId($request);
        $filters = $this->filters($request);

        $courses = $this->scopeToCurriculum(
            Course::where('department_id', $departmentId),
            $this->curriculumForCohort($departmentId, $filters['angkatan'], $this->currentCurriculum($request, $departmentId))
        )
            ->whereHas('cpmks', fn ($query) => $query->where('status', 'Aktif'))
            ->with(['cpmks' => fn ($query) => $query->where('status', 'Aktif')->with('cplMappings')->orderBy('code')])
            ->get()
            ->sortBy(fn ($course) => sprintf('%02d|%s', (int) $course->semester, $course->code))
            ->values();

        $observations = $this->observations($departmentId, $filters, $courses->pluck('id'));

        return response()->json([
            'thresholds' => $this->thresholds(),
            'filters' => $filters,
            'courses' => $courses->map(function (Course $course) use ($observations) {
                $byCpmk = $observations[$course->id] ?? [];
                $stats = $course->cpmks->map(fn ($cpmk) => $this->stats(collect($byCpmk[$cpmk->id] ?? [])->pluck('score')));
                $measured = $stats->where('measured', '>', 0);
                $students = collect($byCpmk)->flatMap(fn ($rows) => array_keys($rows))->unique()->count();

                return [
                    'id' => $course->id,
                    'code' => $course->code,
                    'name' => $course->name,
                    'sks' => $course->sks,
                    'semester' => $course->semester,
                    'cpmkCount' => $course->cpmks->count(),
                    'cpmkMeasured' => $measured->count(),
                    'cpmkAchieved' => $measured->where('status', 'Tercapai')->count(),
                    'students' => $students,
                    'average' => $this->weightedAverage($course->cpmks, $stats),
                    'lowestCpmk' => $measured->isEmpty() ? null : (function () use ($course, $stats) {
                        $index = $stats->filter(fn ($stat) => $stat['measured'] > 0)->sortBy('passedPercent')->keys()->first();

                        return ['code' => $course->cpmks[$index]->code, 'passedPercent' => $stats[$index]['passedPercent']];
                    })(),
                    'status' => $this->courseStatus($course->cpmks->count(), $measured),
                ];
            })->values(),
        ]);
    }

    /** Rincian satu mata kuliah: statistik per CPMK, per kelas, dan nilai per mahasiswa. */
    public function show(Request $request, string $courseId)
    {
        $departmentId = $this->departmentId($request);
        $filters = $this->filters($request);

        $course = Course::where('department_id', $departmentId)
            ->with(['cpmks' => fn ($query) => $query->where('status', 'Aktif')->with('cplMappings.cpl')->orderBy('code')])
            ->find($courseId);
        abort_unless($course, 404, 'Mata kuliah tidak ditemukan.');

        $byCpmk = $this->observations($departmentId, $filters, collect([$course->id]))[$course->id] ?? [];
        $stats = $course->cpmks->map(fn ($cpmk) => $this->stats(collect($byCpmk[$cpmk->id] ?? [])->pluck('score')));
        $measured = $stats->where('measured', '>', 0);

        $studentIds = collect($byCpmk)->flatMap(fn ($rows) => array_keys($rows))->unique()->values();
        $students = Student::whereIn('id', $studentIds)->get()->keyBy('id');
        $classes = $students->pluck('kelas')->map(fn ($kelas) => $kelas ?: '-')->unique()->sort()->values();

        $cpmks = $course->cpmks->values()->map(function ($cpmk, $index) use ($stats, $byCpmk, $students, $classes) {
            $rows = collect($byCpmk[$cpmk->id] ?? []);

            return [
                'id' => $cpmk->id,
                'code' => $cpmk->code,
                'description' => $cpmk->description,
                'weight' => round((float) $cpmk->cplMappings->sum('contribution_weight'), 2),
                'cpls' => $cpmk->cplMappings->map(fn ($mapping) => $mapping->cpl?->code)->filter()->values(),
                ...$stats[$index],
                'byClass' => $classes->map(fn ($kelas) => [
                    'kelas' => $kelas,
                    ...$this->stats($rows->filter(fn ($row, $studentId) => ($students->get($studentId)?->kelas ?: '-') === $kelas)->pluck('score')),
                ])->values(),
            ];
        });

        $studentRows = $studentIds->map(function ($studentId) use ($students, $course, $byCpmk) {
            $student = $students->get($studentId);
            $scores = [];
            $sources = [];
            $weighted = 0.0;
            $weightSum = 0.0;
            foreach ($course->cpmks as $cpmk) {
                $row = $byCpmk[$cpmk->id][$studentId] ?? null;
                if (! $row) {
                    continue;
                }
                $scores[$cpmk->id] = $row['score'];
                $sources[$row['source']] = true;
                $weight = (float) $cpmk->cplMappings->sum('contribution_weight');
                $weighted += $row['score'] * $weight;
                $weightSum += $weight;
            }

            return [
                'id' => $studentId,
                'nim' => $student?->nim,
                'name' => $student?->name,
                'kelas' => $student?->kelas,
                'angkatan' => $student?->angkatan,
                'scores' => (object) $scores,
                'courseScore' => $weightSum > 0 ? round($weighted / $weightSum, 2) : null,
                'belowCount' => collect($scores)->filter(fn ($score) => $score < self::MIN_SCORE)->count(),
                'sources' => array_keys($sources),
            ];
        })->sortBy(fn ($row) => ($row['kelas'] ?? '').'|'.$row['nim'])->values();

        return response()->json([
            'thresholds' => $this->thresholds(),
            'filters' => $filters,
            'course' => [
                'id' => $course->id,
                'code' => $course->code,
                'name' => $course->name,
                'sks' => $course->sks,
                'semester' => $course->semester,
                'cpmkCount' => $course->cpmks->count(),
                'cpmkMeasured' => $measured->count(),
                'cpmkAchieved' => $measured->where('status', 'Tercapai')->count(),
                'students' => $studentIds->count(),
                'average' => $this->weightedAverage($course->cpmks, $stats),
                'status' => $this->courseStatus($course->cpmks->count(), $measured),
            ],
            'cpmks' => $cpmks->values(),
            'students' => $studentRows,
        ]);
    }

    /**
     * Nilai CPMK mahasiswa yang dikelompokkan: [courseId][cpmkId][studentId] => {score, source}.
     */
    private function observations(string $departmentId, array $filters, Collection $courseIds): array
    {
        if ($courseIds->isEmpty()) {
            return [];
        }
        $wanted = $courseIds->flip();
        $students = Student::where('department_id', $departmentId)
            ->when($filters['angkatan'], fn ($query, $angkatan) => $query->where('angkatan', $angkatan))
            ->when($filters['kelas'], fn ($query, $kelas) => $query->where('kelas', $kelas))
            ->get();

        $result = [];
        foreach ($this->achievements->details($students, $filters['semesterType'], $filters['academicYear']) as $studentId => $rows) {
            foreach ($rows as $row) {
                if (! $wanted->has($row['courseId'])) {
                    continue;
                }
                $result[$row['courseId']][$row['cpmkId']][$studentId] = ['score' => (float) $row['score'], 'source' => $row['source']];
            }
        }

        return $result;
    }

    private function stats(Collection $scores): array
    {
        $count = $scores->count();
        if ($count === 0) {
            return ['measured' => 0, 'average' => null, 'min' => null, 'max' => null, 'passed' => 0, 'passedPercent' => null, 'status' => 'Belum Diukur'];
        }
        $passed = $scores->filter(fn ($score) => $score >= self::MIN_SCORE)->count();
        $percent = round($passed * 100 / $count, 2);

        return [
            'measured' => $count,
            'average' => round((float) $scores->avg(), 2),
            'min' => round((float) $scores->min(), 2),
            'max' => round((float) $scores->max(), 2),
            'passed' => $passed,
            'passedPercent' => $percent,
            'status' => $percent >= self::MIN_PERCENT ? 'Tercapai' : 'Belum Tercapai',
        ];
    }

    /** Rata-rata nilai CPMK mata kuliah, ditimbang bobot CPMK (bobot 0 dianggap sama rata). */
    private function weightedAverage(Collection $cpmks, Collection $stats): ?float
    {
        $sum = 0.0;
        $weights = 0.0;
        foreach ($cpmks->values() as $index => $cpmk) {
            if ($stats[$index]['average'] === null) {
                continue;
            }
            $weight = (float) $cpmk->cplMappings->sum('contribution_weight') ?: 1.0;
            $sum += $stats[$index]['average'] * $weight;
            $weights += $weight;
        }

        return $weights > 0 ? round($sum / $weights, 2) : null;
    }

    private function courseStatus(int $cpmkCount, Collection $measured): string
    {
        if ($measured->isEmpty()) {
            return 'Belum Diukur';
        }
        $achieved = $measured->where('status', 'Tercapai')->count();
        if ($achieved === $cpmkCount) {
            return 'Tercapai';
        }

        return $achieved === 0 ? 'Belum Tercapai' : 'Sebagian Tercapai';
    }

    private function thresholds(): array
    {
        return ['minScore' => self::MIN_SCORE, 'minPercent' => self::MIN_PERCENT];
    }

    private function filters(Request $request): array
    {
        $validated = $request->validate([
            'angkatan' => 'nullable|string|max:10',
            'kelas' => 'nullable|string|max:50',
            'semesterType' => 'nullable|in:ganjil,genap,Ganjil,Genap',
            'academicYear' => ['nullable', 'string', 'regex:/^\d{4}\/\d{4}$/'],
        ]);

        return [
            'angkatan' => $validated['angkatan'] ?? null ?: null,
            'kelas' => $validated['kelas'] ?? null ?: null,
            'semesterType' => isset($validated['semesterType']) ? strtolower($validated['semesterType']) : null,
            'academicYear' => $validated['academicYear'] ?? null ?: null,
        ];
    }

    private function departmentId(Request $request): string
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        $departmentId = $user->role === 'super_admin'
            ? $request->input('departmentId', $request->input('department_id'))
            : $user->department_id;
        abort_unless($departmentId, 422, 'Jurusan belum ditentukan.');

        return $departmentId;
    }
}
