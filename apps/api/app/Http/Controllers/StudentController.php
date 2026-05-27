<?php

namespace App\Http\Controllers;

use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class StudentController extends Controller
{
    public function index()
    {
        return response()->json(Student::with('department')->get());
    }

    public function store(Request $request)
    {
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

    public function show(string $id)
    {
        $student = Student::with('department')->findOrFail($id);
        return response()->json($student);
    }

    public function update(Request $request, string $id)
    {
        $student = Student::findOrFail($id);

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

    public function destroy(string $id)
    {
        $student = Student::findOrFail($id);
        $student->delete();
        return response()->json(null, 204);
    }

    public function stats(Request $request)
    {
        $query = Student::query();
        if ($request->has('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        $total = $query->count();

        // Basic grouping by batch (angkatan)
        $byBatch = Student::select('angkatan', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
            ->when($request->has('department_id'), function ($q) use ($request) {
                return $q->where('department_id', $request->department_id);
            })
            ->groupBy('angkatan')
            ->get();

        // Basic grouping by class (kelas)
        $byClass = Student::select('kelas', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
            ->when($request->has('department_id'), function ($q) use ($request) {
                return $q->where('department_id', $request->department_id);
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
        $departmentId = $request->query('department_id');
        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');

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
            ->select('student_grades.student_id', 'student_grades.grade', 'courses.sks')
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
}
