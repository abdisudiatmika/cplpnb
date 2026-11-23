<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\Student;
use App\Models\StudentCpmkScore;
use App\Models\StudentGrade;
use App\Services\StudentCplAchievementService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Input nilai oleh admin prodi per mata kuliah dan angkatan, di luar buku nilai dosen:
 *  - per CPMK  -> student_cpmk_scores
 *  - satuan    -> student_grades (satu nilai mata kuliah, dibagikan ke setiap CPMK saat dihitung)
 * Nilai dari buku nilai dosen yang sudah dikunci tetap diutamakan dalam perhitungan CPL.
 */
class AdminGradeController extends Controller
{
    public function __construct(private StudentCplAchievementService $achievements) {}

    public function sheet(Request $request)
    {
        $departmentId = $this->departmentId($request);
        $validated = $request->validate([
            'courseId' => 'required|string',
            'angkatan' => 'required|string|max:10',
            'kelas' => 'nullable|string|max:50',
        ], [], ['courseId' => 'mata kuliah', 'angkatan' => 'angkatan']);

        $course = Course::where('department_id', $departmentId)->find($validated['courseId']);
        abort_unless($course, 404, 'Mata kuliah tidak ditemukan.');

        $cpmks = $course->cpmks()->where('status', 'Aktif')->with('cplMappings.cpl')->orderBy('code')->get();
        $students = Student::where('department_id', $departmentId)
            ->where('angkatan', $validated['angkatan'])
            ->when($validated['kelas'] ?? null, fn ($query, $kelas) => $query->where('kelas', $kelas))
            ->orderBy('kelas')->orderBy('nim')
            ->get();
        $studentIds = $students->pluck('id');

        $singles = StudentGrade::where('course_id', $course->id)
            ->whereIn('student_id', $studentIds)
            ->where('grade', '!=', 'Belum Diambil')
            ->get()
            ->groupBy('student_id')
            ->map(fn ($attempts) => $this->achievements->latestAttempt($attempts));
        $cpmkScores = StudentCpmkScore::where('course_id', $course->id)
            ->whereIn('student_id', $studentIds)
            ->get()
            ->groupBy('student_id');
        $dosenGraded = $this->achievements->dosenGradedCourses($students);

        $semester = $this->achievements->semesterToNumber($course->semester);

        return response()->json([
            'course' => [
                'id' => $course->id,
                'code' => $course->code,
                'name' => $course->name,
                'sks' => $course->sks,
                'semester' => $semester,
            ],
            'cpmks' => $cpmks->map(fn ($cpmk) => [
                'id' => $cpmk->id,
                'code' => $cpmk->code,
                'description' => $cpmk->description,
                'cpls' => $cpmk->cplMappings->map(fn ($mapping) => $mapping->cpl?->code)->filter()->values(),
            ])->values(),
            'defaults' => [
                'semester' => $semester,
                'academicYear' => $this->achievements->academicYearForSemester($validated['angkatan'], $semester),
            ],
            'students' => $students->map(function ($student) use ($singles, $cpmkScores, $dosenGraded, $course) {
                $single = $singles->get($student->id);
                $scores = $cpmkScores->get($student->id, collect());

                return [
                    'id' => $student->id,
                    'nim' => $student->nim,
                    'name' => $student->name,
                    'kelas' => $student->kelas,
                    'status' => $student->status,
                    'single' => $single ? [
                        'score' => round($this->achievements->legacyScore($single->score, $single->grade), 2),
                        'grade' => $single->grade,
                        'semester' => $single->semester,
                        'academicYear' => $single->academic_year,
                    ] : null,
                    'cpmkScores' => $scores->mapWithKeys(fn ($row) => [$row->cpmk_id => (float) $row->score]),
                    'dosenGraded' => isset($dosenGraded[$student->id][$course->id]),
                ];
            })->values(),
        ]);
    }

    public function saveCpmkScores(Request $request)
    {
        $departmentId = $this->departmentId($request);
        $validated = $this->validateSave($request, [
            'rows.*.scores' => 'present|array',
            'rows.*.scores.*' => 'nullable|numeric|min:0|max:100',
        ]);
        $course = $this->courseInDepartment($validated['courseId'], $departmentId);
        $students = $this->studentsInDepartment($validated['rows'], $departmentId);

        $cpmkIds = $course->cpmks()->pluck('id')->flip();
        $invalid = collect($validated['rows'])->flatMap(fn ($row) => array_keys($row['scores']))
            ->reject(fn ($id) => $cpmkIds->has($id))->unique();
        if ($invalid->isNotEmpty()) {
            throw ValidationException::withMessages(['rows' => ['Sebagian CPMK tidak termasuk mata kuliah '.$course->code.'. Muat ulang tabel lalu coba lagi.']]);
        }

        $saved = 0;
        $deleted = 0;
        DB::transaction(function () use ($validated, $course, $request, &$saved, &$deleted) {
            foreach ($validated['rows'] as $row) {
                foreach ($row['scores'] as $cpmkId => $score) {
                    if ($score === null || $score === '') {
                        $deleted += StudentCpmkScore::where('student_id', $row['studentId'])->where('cpmk_id', $cpmkId)->delete();

                        continue;
                    }
                    StudentCpmkScore::updateOrCreate(
                        ['student_id' => $row['studentId'], 'cpmk_id' => $cpmkId],
                        [
                            'course_id' => $course->id,
                            'score' => round((float) $score, 2),
                            'semester' => (string) $validated['semester'],
                            'academic_year' => $validated['academicYear'],
                            'input_by' => $request->user()->id,
                        ]
                    );
                    $saved++;
                }
            }
        });

        return response()->json($this->saveResult($saved, $deleted, $students, $course));
    }

    public function saveSingleScores(Request $request)
    {
        $departmentId = $this->departmentId($request);
        $validated = $this->validateSave($request, [
            'rows.*.score' => 'present|nullable|numeric|min:0|max:100',
        ]);
        $course = $this->courseInDepartment($validated['courseId'], $departmentId);
        $students = $this->studentsInDepartment($validated['rows'], $departmentId);

        $saved = 0;
        $deleted = 0;
        DB::transaction(function () use ($validated, $course, &$saved, &$deleted) {
            foreach ($validated['rows'] as $row) {
                $attempts = StudentGrade::where('student_id', $row['studentId'])->where('course_id', $course->id)->get();
                if ($row['score'] === null || $row['score'] === '') {
                    // Mengosongkan nilai berarti mahasiswa belum punya nilai MK ini (semua percobaan dihapus).
                    $deleted += StudentGrade::whereIn('id', $attempts->pluck('id'))->delete();

                    continue;
                }

                $score = round((float) $row['score'], 2);
                $data = [
                    'score' => $score,
                    'grade' => $this->achievements->letterForScore($score),
                    'semester' => (string) $validated['semester'],
                    'academic_year' => $validated['academicYear'],
                ];
                $current = $attempts->isNotEmpty() ? $this->achievements->latestAttempt($attempts) : null;
                if ($current) {
                    $current->update($data);
                } else {
                    StudentGrade::create($data + [
                        'id' => (string) Str::uuid(),
                        'student_id' => $row['studentId'],
                        'course_id' => $course->id,
                    ]);
                }
                $saved++;
            }
        });

        return response()->json($this->saveResult($saved, $deleted, $students, $course));
    }

    private function validateSave(Request $request, array $rules): array
    {
        return $request->validate(array_merge([
            'courseId' => 'required|string',
            'semester' => 'required|integer|min:1|max:14',
            'academicYear' => ['required', 'string', 'regex:/^\d{4}\/\d{4}$/'],
            'rows' => 'required|array|min:1|max:2000',
            'rows.*.studentId' => 'required|string|distinct',
        ], $rules), [
            'academicYear.regex' => 'Tahun ajaran harus berformat 2025/2026.',
            'rows.required' => 'Tidak ada perubahan nilai untuk disimpan.',
        ], [
            'courseId' => 'mata kuliah',
            'semester' => 'semester',
            'academicYear' => 'tahun ajaran',
            'rows.*.score' => 'nilai',
            'rows.*.scores.*' => 'nilai CPMK',
        ]);
    }

    private function saveResult(int $saved, int $deleted, Collection $students, Course $course): array
    {
        $dosenGraded = $this->achievements->dosenGradedCourses($students);
        $overridden = $students->filter(fn ($student) => isset($dosenGraded[$student->id][$course->id]))->count();

        $parts = [];
        if ($saved > 0) {
            $parts[] = $saved.' nilai disimpan';
        }
        if ($deleted > 0) {
            $parts[] = $deleted.' nilai dihapus';
        }
        $message = ($parts ? ucfirst(implode(', ', $parts)) : 'Tidak ada perubahan').'.';
        if ($overridden > 0) {
            $message .= ' '.$overridden.' mahasiswa sudah punya nilai dari buku nilai dosen yang dikunci; nilai dosen tetap dipakai untuk mereka.';
        }

        return ['saved' => $saved, 'deleted' => $deleted, 'dosenGraded' => $overridden, 'message' => $message];
    }

    private function departmentId(Request $request): string
    {
        $user = $request->user();
        abort_unless($user?->role === 'admin_jurusan', 403, 'Input nilai hanya untuk admin prodi.');
        abort_unless($user->department_id, 422, 'Jurusan akun belum ditentukan.');

        return $user->department_id;
    }

    private function courseInDepartment(string $courseId, string $departmentId): Course
    {
        $course = Course::where('department_id', $departmentId)->find($courseId);
        abort_unless($course, 404, 'Mata kuliah tidak ditemukan.');

        return $course;
    }

    private function studentsInDepartment(array $rows, string $departmentId): Collection
    {
        $ids = collect($rows)->pluck('studentId')->unique()->values();
        $students = Student::where('department_id', $departmentId)->whereIn('id', $ids)->get();
        abort_if($students->count() !== $ids->count(), 403, 'Sebagian mahasiswa tidak berada pada jurusan Anda.');

        return $students;
    }
}
