<?php

namespace App\Http\Controllers;

use App\Models\Cpl;
use App\Models\GraduateProfile;
use App\Services\StudentCplAchievementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CplController extends Controller
{
    public function __construct(private StudentCplAchievementService $studentCplAchievements) {}

    public function index(Request $request)
    {
        $user = $request->user();
        $query = Cpl::with('department');
        if ($user && $user->role === 'admin_jurusan') {
            $query->where('department_id', $user->department_id);
        }
        $this->scopeToCurriculum($query, $this->currentCurriculum($request));

        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $this->pinDepartment($request);
        $targetValue = $request->input('targetValue', $request->input('target_value'));
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        if ($departmentId === null && $request->user()) {
            $departmentId = $request->user()->department_id;
        }

        $request->merge([
            'code' => strtoupper(trim((string) $request->input('code'))),
            'target_value' => $targetValue,
            'department_id' => $departmentId,
        ]);
        $curriculum = $departmentId ? $this->currentCurriculum($request, $departmentId) : null;

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:50',
                'regex:/^CPL-[1-9][0-9]*$/',
                $curriculum
                    ? Rule::unique('cpls', 'code')->where('curriculum_id', $curriculum->id)
                    : Rule::unique('cpls', 'code')->where('department_id', $departmentId),
            ],
            'description' => 'required|string',
            'target_value' => 'nullable|integer|min:0|max:100',
            'department_id' => 'required|exists:departments,id',
        ]);

        if (! isset($validated['target_value']) || $validated['target_value'] === null) {
            $validated['target_value'] = 75;
        }

        $validated['id'] = (string) Str::uuid();
        $validated['curriculum_id'] = $curriculum?->id;

        $cpl = Cpl::create($validated);

        return response()->json($cpl->load('department'), 201);
    }

    public function show(Request $request, string $id)
    {
        $cpl = Cpl::with('department')->findOrFail($id);
        $this->ensureSameDepartment($request, $cpl->department_id);

        return response()->json($cpl);
    }

    public function update(Request $request, string $id)
    {
        $cpl = Cpl::findOrFail($id);
        $this->ensureSameDepartment($request, $cpl->department_id);
        $this->pinDepartment($request);

        $targetValue = $request->input('targetValue', $request->input('target_value'));
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        $effectiveDepartmentId = $departmentId ?? $cpl->department_id;
        if ($request->has('code')) {
            $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        }
        if ($targetValue !== null) {
            $request->merge(['target_value' => $targetValue]);
        }
        if ($departmentId !== null) {
            $request->merge(['department_id' => $departmentId]);
        }

        $validated = $request->validate([
            'code' => [
                'sometimes',
                'required',
                'string',
                'max:50',
                'regex:/^CPL-[1-9][0-9]*$/',
                $cpl->curriculum_id
                    ? Rule::unique('cpls', 'code')->where('curriculum_id', $cpl->curriculum_id)->ignore($cpl->id)
                    : Rule::unique('cpls', 'code')->where('department_id', $effectiveDepartmentId)->ignore($cpl->id),
            ],
            'description' => 'sometimes|required|string',
            'target_value' => 'sometimes|nullable|integer|min:0|max:100',
            'department_id' => 'sometimes|required|exists:departments,id',
        ]);

        if (array_key_exists('target_value', $validated) && ($validated['target_value'] === null)) {
            $validated['target_value'] = 75;
        }

        $cpl->update($validated);

        return response()->json($cpl->load('department'));
    }

    public function destroy(Request $request, string $id)
    {
        $cpl = Cpl::findOrFail($id);
        $this->ensureSameDepartment($request, $cpl->department_id);
        $guard = app(\App\Services\DeletionGuard::class);
        $guard->abortIfUsed(
            $cpl->code,
            $guard->cplUsage($cpl->id),
            'Lepaskan CPL ini dari CPMK dan mata kuliah terlebih dahulu.'
        );
        $cpl->delete();

        return response()->json(null, 204);
    }

    public function bulk(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->department_id, 422, 'Jurusan akun belum ditentukan.');

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.code' => ['required', 'string', 'max:50', 'regex:/^CPL-[1-9][0-9]*$/i', 'distinct:ignore_case'],
            'items.*.description' => 'required|string',
            'items.*.targetValue' => 'nullable|integer|min:0|max:100',
        ]);

        $codes = collect($validated['items'])->pluck('code')->map(fn ($code) => strtoupper($code));
        $curriculum = $this->currentCurriculum($request, $user->department_id);
        abort_if(
            $this->scopeToCurriculum(Cpl::where('department_id', $user->department_id), $curriculum)->whereIn('code', $codes)->exists(),
            422,
            'Salah satu kode CPL sudah digunakan.'
        );

        $created = DB::transaction(function () use ($validated, $user, $curriculum) {
            return collect($validated['items'])->map(function (array $item) use ($user, $curriculum) {
                return Cpl::create([
                    'id' => (string) Str::uuid(),
                    'code' => strtoupper($item['code']),
                    'description' => $item['description'],
                    'target_value' => $item['targetValue'] ?? 75,
                    'department_id' => $user->department_id,
                    'curriculum_id' => $curriculum?->id,
                ]);
            });
        });

        return response()->json($created, 201);
    }

    /**
     * GET /cpl/course-breakdown/{cplId}
     * Returns per-course average scores for a specific CPL.
     */
    public function courseBreakdown(Request $request, string $cplId)
    {
        $user = $request->user();
        $departmentId = ($user && $user->role === 'admin_jurusan') ? $user->department_id : $request->query('department_id', $request->query('departmentId'));
        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');
        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));

        $cpl = Cpl::findOrFail($cplId);

        // Get mappings for this CPL
        $mappings = \Illuminate\Support\Facades\DB::table('course_cpl_mappings')
            ->join('courses', 'course_cpl_mappings.course_id', '=', 'courses.id')
            ->select('course_cpl_mappings.course_id', 'course_cpl_mappings.weight', 'courses.code as course_code', 'courses.name as course_name', 'courses.sks')
            ->where('course_cpl_mappings.cpl_id', $cplId)
            ->when($departmentId, function ($q) use ($departmentId) {
                return $q->where('courses.department_id', $departmentId);
            })->get();

        if ($mappings->isEmpty()) {
            return response()->json([]);
        }

        // Get filtered students
        $studentQuery = \App\Models\Student::query();
        if ($departmentId) {
            $studentQuery->where('department_id', $departmentId);
        }
        if ($angkatan) {
            $studentQuery->where('angkatan', $angkatan);
        }
        if ($kelas) {
            $studentQuery->where('kelas', $kelas);
        }
        $students = $studentQuery->pluck('id');

        if ($students->isEmpty()) {
            return response()->json($mappings->map(function ($map) {
                return [
                    'course_code' => $map->course_code,
                    'course_name' => $map->course_name,
                    'sks' => $map->sks,
                    'weight' => $map->weight,
                    'average_score' => 0,
                    'students_graded' => 0,
                ];
            })->values());
        }

        $courseIds = $mappings->pluck('course_id');
        $scoresByCourse = $this->courseScoresByStudent($studentQuery->get(), $semesterType, $academicYear, $courseIds);

        $result = [];
        foreach ($mappings as $map) {
            $scores = collect($scoresByCourse[$map->course_id] ?? []);
            $count = $scores->count();

            $result[] = [
                'course_code' => $map->course_code,
                'course_name' => $map->course_name,
                'sks' => $map->sks,
                'weight' => $map->weight,
                'average_score' => $count > 0 ? round($scores->avg()) : 0,
                'students_graded' => $count,
            ];
        }

        return response()->json($result);
    }

    /**
     * Nilai mata kuliah per mahasiswa (skala 0-100): [course_id => [student_id => nilai]].
     * Urutan prioritas: buku nilai dosen yang dikunci, rata-rata nilai CPMK admin, lalu
     * nilai satuan mata kuliah (student_grades).
     */
    private function courseScoresByStudent($students, $semesterType = null, $academicYear = null, $courseIds = null): array
    {
        $students = collect($students);
        if ($students->isEmpty()) {
            return [];
        }

        $legacyGrades = DB::table('student_grades')
            ->whereIn('student_id', $students->pluck('id'))
            ->when($courseIds !== null, fn ($q) => $q->whereIn('course_id', $courseIds))
            ->get();
        $studentsById = $students->keyBy('id');
        $legacyGrades = $legacyGrades
            ->groupBy(fn ($g) => $g->student_id.'|'.$g->course_id)
            ->map(fn ($attempts) => $this->studentCplAchievements->latestAttempt($attempts))
            ->filter(fn ($g) => $this->studentCplAchievements->matchesAcademicPeriod(
            $g->semester ?? null,
            $studentsById->get($g->student_id)?->angkatan,
            $semesterType,
            $academicYear
        ));

        $scores = [];
        foreach ($legacyGrades as $g) {
            if ($g->grade === 'Belum Diambil') {
                continue;
            }
            $scores[$g->course_id][$g->student_id] = $this->studentCplAchievements->legacyScore($g->score ?? null, $g->grade);
        }

        $courseIdFilter = $courseIds !== null ? collect($courseIds)->flip() : null;
        foreach ($this->studentCplAchievements->courseFinalScores($students, $semesterType, $academicYear) as $courseId => $obeScores) {
            if ($courseIdFilter && ! $courseIdFilter->has($courseId)) {
                continue;
            }
            foreach ($obeScores as $studentId => $score) {
                $scores[$courseId][$studentId] = $score;
            }
        }

        return $scores;
    }

    public function averages(Request $request)
    {
        $user = $request->user();
        $departmentId = ($user && $user->role === 'admin_jurusan') ? $user->department_id : $request->query('department_id', $request->query('departmentId'));
        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');
        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));

        $curriculum = $this->curriculumForCohort($departmentId, $angkatan, $this->currentCurriculum($request, $departmentId));
        $averages = $this->calculateAveragesInternal($departmentId, $angkatan, $kelas, $semesterType, $academicYear, $curriculum);

        return response()->json($averages);
    }

    private function calculateAveragesInternal($departmentId, $angkatan, $kelas, $semesterType = null, $academicYear = null, $curriculum = null)
    {
        $cplQuery = Cpl::query();
        if ($departmentId) {
            $cplQuery->where('department_id', $departmentId);
        }
        $this->scopeToCurriculum($cplQuery, $curriculum);
        $allCpls = $cplQuery->get();

        $studentQuery = \App\Models\Student::query();
        if ($departmentId) {
            $studentQuery->where('department_id', $departmentId);
        }
        if ($angkatan) {
            $studentQuery->where('angkatan', $angkatan);
        }
        if ($kelas) {
            $studentQuery->where('kelas', $kelas);
        }

        $studentsList = $studentQuery->get();

        // Nilai CPL per mahasiswa dari semua sumber (buku nilai dosen, nilai CPMK admin,
        // nilai satuan mata kuliah); prioritasnya diatur di StudentCplAchievementService.
        $cplScoresByStudent = $this->studentCplAchievements
            ->calculate($studentsList, $semesterType, $academicYear);

        $averages = [];

        foreach ($allCpls as $cpl) {
            if ($studentsList->isEmpty()) {
                $averages[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'value' => 0,
                    'status' => 'Belum Diukur',
                    'target' => $cpl->target_value ?? 70,
                ];

                continue;
            }

            $totalCplSum = 0;
            $studentsMeasured = 0;

            foreach ($studentsList as $student) {
                $studentScores = $cplScoresByStudent->get($student->id, collect());
                if ($studentScores->has($cpl->id)) {
                    $totalCplSum += (float) $studentScores->get($cpl->id);
                    $studentsMeasured++;
                }
            }

            if ($studentsMeasured === 0) {
                $averages[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'value' => 0,
                    'status' => 'Belum Diukur',
                    'target' => $cpl->target_value ?? 75,
                ];
            } else {
                $value = round($totalCplSum / $studentsMeasured);
                $target = $cpl->target_value ?? 75;

                if ($value >= 85) {
                    $status = 'Sangat kompeten (Exemplary)';
                } elseif ($value >= 75) {
                    $status = 'Kompeten (Competent)';
                } elseif ($value >= 60) {
                    $status = 'Berkembang (Developing)';
                } else {
                    $status = 'Tidak memuaskan (Unsatisfactory)';
                }

                $averages[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'value' => $value,
                    'status' => $status,
                    'target' => $target,
                ];
            }
        }

        return $averages;
    }

    public function courseSummary(Request $request)
    {
        $user = $request->user();
        $departmentId = ($user && $user->role === 'admin_jurusan') ? $user->department_id : $request->query('department_id', $request->query('departmentId'));
        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');
        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));

        $coursesQuery = \App\Models\Course::query();
        if ($departmentId) {
            $coursesQuery->where('department_id', $departmentId);
        }
        $this->scopeToCurriculum($coursesQuery, $this->curriculumForCohort($departmentId, $angkatan, $departmentId ? $this->currentCurriculum($request, $departmentId) : null));
        $courses = $coursesQuery->get();

        $studentQuery = \App\Models\Student::query();
        if ($departmentId) {
            $studentQuery->where('department_id', $departmentId);
        }
        if ($angkatan) {
            $studentQuery->where('angkatan', $angkatan);
        }
        if ($kelas) {
            $studentQuery->where('kelas', $kelas);
        }

        $allMappings = \Illuminate\Support\Facades\DB::table('course_cpl_mappings')
            ->join('cpls', 'course_cpl_mappings.cpl_id', '=', 'cpls.id')
            ->select('course_cpl_mappings.course_id', 'course_cpl_mappings.cpl_id', 'course_cpl_mappings.weight', 'cpls.code as cpl_code', 'cpls.description as cpl_desc', 'cpls.target_value')
            ->get();

        $scoresByCourse = $this->courseScoresByStudent($studentQuery->get(), $semesterType, $academicYear, $courses->pluck('id'));

        $cplAverages = $this->calculateAveragesInternal($departmentId, $angkatan, $kelas, $semesterType, $academicYear);

        $result = [];
        foreach ($courses as $c) {
            $courseScores = collect($scoresByCourse[$c->id] ?? []);
            $gradedCount = $courseScores->count();
            $avgGrade = $gradedCount > 0 ? round($courseScores->avg(), 2) : 0;

            $courseMappings = $allMappings->where('course_id', $c->id);
            $mappingsData = [];
            foreach ($courseMappings as $map) {
                $cplAvgObj = collect($cplAverages)->firstWhere('id', $map->cpl_id);
                $mappingsData[] = [
                    'cpl_id' => $map->cpl_id,
                    'cpl_code' => $map->cpl_code,
                    'cpl_desc' => $map->cpl_desc,
                    'weight' => $map->weight,
                    'cpl_average' => $cplAvgObj ? $cplAvgObj['value'] : 0,
                    'cpl_status' => $cplAvgObj ? $cplAvgObj['status'] : 'Belum Terukur',
                    'cpl_target' => $map->target_value ?? 70,
                ];
            }

            $result[] = [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'sks' => $c->sks,
                'average_grade' => $avgGrade,
                'grades_count' => $gradedCount,
                'mappings' => $mappingsData,
            ];
        }

        return response()->json($result);
    }

    public function achievements(Request $request, string $studentId)
    {
        $student = \App\Models\Student::findOrFail($studentId);
        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan' && $student->department_id !== $user->department_id) {
            abort(403, 'Unauthorized');
        }
        $departmentId = $student->department_id;
        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));

        $curriculum = $this->curriculumForCohort($departmentId, $student->angkatan, $this->currentCurriculum($request, $departmentId));
        $allCpls = $this->scopeToCurriculum(Cpl::where('department_id', $departmentId), $curriculum)->get();
        $scores = $this->studentCplAchievements
            ->calculate(collect([$student]), $semesterType, $academicYear)
            ->get($student->id, collect());

        $achievements = $allCpls->map(fn ($cpl) => $this->achievementPayload(
            $cpl,
            $scores->has($cpl->id) ? (float) $scores->get($cpl->id) : null
        ))->values()->all();

        return response()->json($achievements);
    }

    public function transcript(Request $request, string $studentId)
    {
        $student = \App\Models\Student::with('department')->findOrFail($studentId);
        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan' && $student->department_id !== $user->department_id) {
            abort(403, 'Unauthorized');
        }

        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));
        $achievements = $this->achievements($request, $studentId)->getData(true);
        $details = $this->studentCplAchievements->details(collect([$student]), $semesterType, $academicYear)->get($student->id, collect())->values();
        $profileCurriculum = $this->curriculumForCohort($student->department_id, $student->angkatan, $this->currentCurriculum($request, $student->department_id));
        $profiles = $this->scopeToCurriculum(GraduateProfile::with('cplMappings.cpl')
            ->where('department_id', $student->department_id)->where('status', 'Aktif'), $profileCurriculum)->orderBy('sequence')->get()
            ->map(function ($profile) use ($achievements) {
                $values = collect($profile->cplMappings)->map(fn ($mapping) => collect($achievements)->firstWhere('id', $mapping->cpl_id))
                    ->filter(fn ($cpl) => $cpl && (float) ($cpl['value'] ?? 0) > 0)->pluck('value');
                $score = $values->isEmpty() ? null : round((float) $values->avg(), 2);
                return ['id' => $profile->id, 'code' => $profile->code, 'name' => $profile->name, 'englishName' => $profile->english_name,
                    'summary' => $profile->summary, 'score' => $score, 'status' => $score === null ? 'Belum Diukur' : ($score >= 75 ? 'Tercapai' : 'Belum Tercapai'),
                    'cpls' => $profile->cplMappings->map(fn ($mapping) => ['code' => $mapping->cpl?->code, 'type' => $mapping->contribution_type])->filter(fn ($mapping) => $mapping['code'])->values()->all()];
            })->values();
        $measured = collect($achievements)->filter(fn ($item) => (float) ($item['value'] ?? 0) > 0);
        return response()->json(['student' => ['id' => $student->id, 'nim' => $student->nim, 'name' => $student->name, 'angkatan' => $student->angkatan, 'kelas' => $student->kelas, 'status' => $student->status, 'programStudi' => $student->department?->name],
            'summary' => ['totalCpl' => count($achievements), 'measuredCpl' => $measured->count(), 'competentCpl' => $measured->filter(fn ($item) => (float) $item['value'] >= 75)->count(), 'averageCpl' => $measured->isEmpty() ? null : round((float) $measured->avg('value'), 2), 'target' => 75],
            'profiles' => $profiles, 'cpls' => $achievements, 'cpmks' => $details]);
    }

    private function achievementPayload(Cpl $cpl, ?float $value): array
    {
        return [
            'id' => $cpl->id,
            'code' => $cpl->code,
            'name' => $cpl->name,
            'description' => $cpl->description,
            'value' => $value === null ? 0 : round($value, 2),
            'status' => $this->achievementStatus($value),
            'target' => $cpl->target_value ?? 75,
        ];
    }

    private function achievementStatus(?float $value): string
    {
        if ($value === null) {
            return 'Belum Diukur';
        }
        if ($value >= 85) {
            return 'Sangat kompeten (Exemplary)';
        }
        if ($value >= 75) {
            return 'Kompeten (Competent)';
        }
        if ($value >= 60) {
            return 'Berkembang (Developing)';
        }

        return 'Tidak memuaskan (Unsatisfactory)';
    }

    public function achievementsBulk(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'admin_jurusan', 403, 'Unauthorized');
        abort_unless($user->department_id, 422, 'Jurusan akun belum ditentukan.');
        $departmentId = $user->department_id;

        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');
        $search = trim((string) $request->query('search', ''));
        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));

        $students = \App\Models\Student::query()
            ->where('department_id', $departmentId)
            ->when($angkatan, fn ($query) => $query->where('angkatan', $angkatan))
            ->when($kelas, fn ($query) => $query->where('kelas', $kelas))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('nim', 'like', "%{$search}%")
                        ->orWhere('name', 'like', "%{$search}%");
                });
            })
            ->orderBy('nim')
            ->get();

        if ($students->isEmpty()) {
            return response()->json(['students' => []]);
        }

        $allCpls = $this->scopeToCurriculum(Cpl::where('department_id', $departmentId), $this->curriculumForCohort($departmentId, $angkatan, $this->currentCurriculum($request, $departmentId)))
            ->orderBy('code')
            ->get();
        $scoresByStudent = $this->studentCplAchievements->calculate($students, $semesterType, $academicYear);

        $result = $students->map(function ($student) use ($allCpls, $scoresByStudent) {
            $scores = $scoresByStudent->get($student->id, collect());
            $achievements = $allCpls->map(fn ($cpl) => $this->achievementPayload(
                $cpl,
                $scores->has($cpl->id) ? (float) $scores->get($cpl->id) : null
            ))->values();

            return [
                'id' => $student->id,
                'nim' => $student->nim,
                'name' => $student->name,
                'angkatan' => $student->angkatan,
                'kelas' => $student->kelas,
                'status' => $student->status,
                'achievements' => $achievements,
            ];
        })->values();

        return response()->json(['students' => $result]);
    }
}
