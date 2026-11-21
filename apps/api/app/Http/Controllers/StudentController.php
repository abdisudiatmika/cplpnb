<?php

namespace App\Http\Controllers;

use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StudentController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Student::with('department');
        if ($user && $user->role === 'admin_jurusan') {
            $query->where('department_id', $user->department_id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $this->pinDepartment($request);
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        if ($departmentId === null && $request->user()) {
            $departmentId = $request->user()->department_id;
        }

        $request->merge(['department_id' => $departmentId]);

        $validated = $request->validate([
            'nim' => 'required|string|max:50|unique:students',
            'name' => 'required|string|max:255',
            'angkatan' => 'required|string|max:50',
            'kelas' => 'required|string|max:50',
            'status' => 'required|in:Aktif,Lulus,Cuti',
            'department_id' => 'required|exists:departments,id',
        ]);

        $validated['id'] = (string) Str::uuid();

        $student = Student::create($validated);
        return response()->json($student->load('department'), 201);
    }

    public function show(Request $request, string $id)
    {
        $student = Student::with('department')->findOrFail($id);
        $this->ensureSameDepartment($request, $student->department_id);
        return response()->json($student);
    }

    public function update(Request $request, string $id)
    {
        $student = Student::findOrFail($id);
        $this->ensureSameDepartment($request, $student->department_id);
        $this->pinDepartment($request);

        $departmentId = $request->input('departmentId', $request->input('department_id'));
        if ($departmentId !== null) {
            $request->merge(['department_id' => $departmentId]);
        }

        $validated = $request->validate([
            'nim' => 'sometimes|required|string|max:50|unique:students,nim,' . $student->id,
            'name' => 'sometimes|required|string|max:255',
            'angkatan' => 'sometimes|required|string|max:50',
            'kelas' => 'sometimes|required|string|max:50',
            'status' => 'sometimes|required|in:Aktif,Lulus,Cuti',
            'department_id' => 'sometimes|required|exists:departments,id',
        ]);

        $student->update($validated);
        return response()->json($student->load('department'));
    }

    public function destroy(Request $request, string $id)
    {
        $student = Student::findOrFail($id);
        $this->ensureSameDepartment($request, $student->department_id);
        $guard = app(\App\Services\DeletionGuard::class);
        $guard->abortIfUsed(
            'Mahasiswa '.$student->nim,
            $guard->studentUsage([$student->id])[$student->id],
            'Menghapusnya akan ikut menghapus nilai tersebut. Ubah status mahasiswa bila sudah tidak aktif.'
        );
        $student->delete();
        return response()->json(null, 204);
    }

    public function bulk(Request $request)
    {
        $departmentId = $request->user()?->department_id;

        if ($departmentId === null) {
            return response()->json(['error' => 'User does not belong to a department.'], 400);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.nim' => 'required|string|max:50|distinct',
            'items.*.name' => 'required|string|max:255',
            'items.*.angkatan' => 'required|string|max:50',
            'items.*.kelas' => 'required|string|max:50',
            'items.*.status' => 'nullable|in:Aktif,Lulus,Cuti',
        ]);

        $now = now();
        $nims = collect($validated['items'])->pluck('nim');
        $studentsFromOtherDepartments = Student::whereIn('nim', $nims)
            ->where('department_id', '!=', $departmentId)
            ->pluck('nim');

        if ($studentsFromOtherDepartments->isNotEmpty()) {
            return response()->json([
                'message' => 'Beberapa NIM sudah terdaftar di jurusan lain: ' . $studentsFromOtherDepartments->join(', '),
            ], 422);
        }

        $studentIds = DB::transaction(function () use ($validated, $departmentId, $now) {
            return collect($validated['items'])->map(function ($item) use ($departmentId, $now) {
                $student = Student::firstOrNew(['nim' => $item['nim']]);

                if (!$student->exists) {
                    $student->id = (string) Str::uuid();
                    $student->department_id = $departmentId;
                    $student->created_at = $now;
                }

                $student->name = $item['name'];
                $student->angkatan = $item['angkatan'];
                $student->kelas = $item['kelas'];
                $student->status = $item['status'] ?? 'Aktif';
                $student->updated_at = $now;
                $student->save();

                return $student->id;
            });
        });

        return response()->json(
            Student::with('department')->whereIn('id', $studentIds)->get(),
            201
        );
    }

    public function bulkDelete(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'required|string',
        ]);

        $query = Student::whereIn('id', $validated['ids']);

        if ($request->user()?->role === 'admin_jurusan') {
            $query->where('department_id', $request->user()->department_id);
        }

        $idsToDelete = $query->pluck('id');

        if ($idsToDelete->isEmpty()) {
            return response()->json(['message' => 'Tidak ada mahasiswa yang cocok untuk dihapus.', 'count' => 0]);
        }

        $guard = app(\App\Services\DeletionGuard::class);
        $guard->abortIfAnyUsed(
            'mahasiswa',
            $guard->studentUsage($idsToDelete),
            Student::whereIn('id', $idsToDelete)->pluck('nim', 'id'),
            'Hapus centang mahasiswa tersebut lalu ulangi.'
        );

        Student::whereIn('id', $idsToDelete)->delete();

        return response()->json([
            'message' => 'Mahasiswa berhasil dihapus secara massal',
            'count' => $idsToDelete->count(),
        ]);
    }

    public function stats(Request $request)
    {
        $user = $request->user();
        $departmentId = ($user && $user->role === 'admin_jurusan') ? $user->department_id : $request->query('department_id', $request->query('departmentId'));

        $query = Student::query();
        if ($departmentId) {
            $query->where('department_id', $departmentId);
        }

        $total = $query->count();

        // Basic grouping by batch (angkatan)
        $byBatch = Student::select('angkatan', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
            ->when($departmentId, function ($q) use ($departmentId) {
                return $q->where('department_id', $departmentId);
            })
            ->groupBy('angkatan')
            ->get();

        // Basic grouping by class (kelas)
        $byClass = Student::select('kelas', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
            ->when($departmentId, function ($q) use ($departmentId) {
                return $q->where('department_id', $departmentId);
            })
            ->groupBy('kelas')
            ->get();

        return response()->json([
            'total' => $total,
            'byBatch' => $byBatch,
            'byClass' => $byClass
        ]);
    }

    public function ipkAverage(Request $request)
    {
        $user = $request->user();
        $departmentId = ($user && $user->role === 'admin_jurusan') ? $user->department_id : $request->query('department_id', $request->query('departmentId'));
        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');
        $semesterType = $request->query('semesterType', $request->query('periodeAmi'));
        $academicYear = $request->query('academicYear', $request->query('academic_year'));

        $studentQuery = Student::query();
        if ($departmentId) {
            $studentQuery->where('department_id', $departmentId);
        }
        if ($angkatan) {
            $studentQuery->where('angkatan', $angkatan);
        }
        if ($kelas) {
            $studentQuery->where('kelas', $kelas);
        }

        $allGrades = \Illuminate\Support\Facades\DB::table('student_grades')
            ->join('students', 'student_grades.student_id', '=', 'students.id')
            ->join('courses', 'student_grades.course_id', '=', 'courses.id')
            ->select('student_grades.student_id', 'student_grades.grade', 'student_grades.semester', 'students.angkatan', 'courses.sks')
            ->when($departmentId, function($q) use ($departmentId) {
                return $q->where('students.department_id', $departmentId);
            })
            ->when($angkatan, function($q) use ($angkatan) {
                return $q->where('students.angkatan', $angkatan);
            })
            ->when($kelas, function($q) use ($kelas) {
                return $q->where('students.kelas', $kelas);
            })
            ->get();
        $allGrades = $this->filterGradesForAcademicPeriod($allGrades, $semesterType, $academicYear);

        $studentStats = [];
        foreach ($allGrades as $g) {
            if ($g->grade === 'Belum Diambil') continue;

            $gradePoint = 0;
            switch ($g->grade) {
                case 'A': $gradePoint = 4.0; break;
                case 'A-': $gradePoint = 3.7; break;
                case 'B+': $gradePoint = 3.3; break;
                case 'B': $gradePoint = 3.0; break;
                case 'B-': $gradePoint = 2.7; break;
                case 'C+': $gradePoint = 2.3; break;
                case 'C': $gradePoint = 2.0; break;
                case 'D': $gradePoint = 1.0; break;
                default: $gradePoint = 0.0;
            }

            if (!isset($studentStats[$g->student_id])) {
                $studentStats[$g->student_id] = ['score' => 0, 'sks' => 0];
            }
            $studentStats[$g->student_id]['score'] += $gradePoint * $g->sks;
            $studentStats[$g->student_id]['sks'] += $g->sks;
        }

        $sumIpk = 0;
        $studentsWithIpk = 0;

        foreach ($studentStats as $stats) {
            if ($stats['sks'] > 0) {
                $sumIpk += $stats['score'] / $stats['sks'];
                $studentsWithIpk++;
            }
        }

        $averageIpk = $studentsWithIpk > 0 ? round($sumIpk / $studentsWithIpk, 2) : 0;

        return response()->json(['averageIpk' => $averageIpk]);
    }

    public function academicSummary(Request $request, string $studentId)
    {
        $student = Student::findOrFail($studentId);
        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan' && $student->department_id !== $user->department_id) abort(403, 'Unauthorized');
        $grades = DB::table('student_grades')->join('courses', 'student_grades.course_id', '=', 'courses.id')
            ->where('student_grades.student_id', $studentId)->select('student_grades.grade', 'student_grades.semester', 'courses.sks')->get();
        $points = ['A'=>4.0,'A-'=>3.7,'B+'=>3.3,'B'=>3.0,'B-'=>2.7,'C+'=>2.3,'C'=>2.0,'D'=>1.0,'E'=>0.0];
        $totalSks = 0; $passedSks = 0; $quality = 0; $semester = [];
        foreach ($grades as $grade) {
            if (!isset($points[$grade->grade])) continue;
            $sks = (float) $grade->sks; $totalSks += $sks; $quality += $points[$grade->grade] * $sks;
            if ($points[$grade->grade] >= 2.0) $passedSks += $sks;
            $semester[$grade->semester ?? 'Tidak diketahui'][] = [$points[$grade->grade], $sks];
        }
        $semesterIpk = collect($semester)->mapWithKeys(function ($items, $key) {
            $sks = collect($items)->sum(fn ($item) => $item[1]); $quality = collect($items)->sum(fn ($item) => $item[0] * $item[1]);
            return [$key => $sks > 0 ? round($quality / $sks, 2) : null];
        });
        return response()->json(['ips' => $semesterIpk->sortKeysDesc()->first(), 'ipk' => $totalSks > 0 ? round($quality / $totalSks, 2) : null, 'totalSks' => $totalSks, 'passedSks' => $passedSks]);
    }

    private function filterGradesForAcademicPeriod($grades, $semesterType = null, $academicYear = null)
    {
        if (!$semesterType && !$academicYear) {
            return $grades;
        }

        return $grades->filter(function ($grade) use ($semesterType, $academicYear) {
            $semesterNumber = $this->semesterToNumber($grade->semester ?? null);
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

            if (!$academicYear) {
                return true;
            }

            $currentSemester = $this->currentSemesterForCohort($grade->angkatan ?? null, $academicYear, $period);
            return $currentSemester === null || $semesterNumber === $currentSemester;
        })->values();
    }

    private function currentSemesterForCohort($angkatan, $academicYear, $semesterType = null)
    {
        if (!$angkatan || !preg_match('/^\d{4}/', (string) $academicYear, $matches)) {
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

    private function semesterToNumber($semester)
    {
        $value = strtoupper(trim((string) $semester));
        if ($value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        $roman = [
            'I' => 1,
            'II' => 2,
            'III' => 3,
            'IV' => 4,
            'V' => 5,
            'VI' => 6,
            'VII' => 7,
            'VIII' => 8,
        ];

        return $roman[$value] ?? null;
    }
}
