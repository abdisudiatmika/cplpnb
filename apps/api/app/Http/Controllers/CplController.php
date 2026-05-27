<?php

namespace App\Http\Controllers;

use App\Models\Cpl;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CplController extends Controller
{
    public function index()
    {
        return response()->json(Cpl::with('department')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'description' => 'required|string',
            'category' => 'required|in:Sikap,Pengetahuan,Keterampilan Umum,Keterampilan Khusus',
            'target_value' => 'required|integer|min:0|max:100',
            'department_id' => 'required|exists:departments,id',
        ]);

        $validated['id'] = (string) Str::uuid();

        $cpl = Cpl::create($validated);
        return response()->json($cpl->load('department'), 201);
    }

    public function show(string $id)
    {
        $cpl = Cpl::with('department')->findOrFail($id);
        return response()->json($cpl);
    }

    public function update(Request $request, string $id)
    {
        $cpl = Cpl::findOrFail($id);

        $validated = $request->validate([
            'code' => 'sometimes|required|string|max:50',
            'description' => 'sometimes|required|string',
            'category' => 'sometimes|required|in:Sikap,Pengetahuan,Keterampilan Umum,Keterampilan Khusus',
            'target_value' => 'sometimes|required|integer|min:0|max:100',
            'department_id' => 'sometimes|required|exists:departments,id',
        ]);

        $cpl->update($validated);
        return response()->json($cpl->load('department'));
    }

    public function destroy(string $id)
    {
        $cpl = Cpl::findOrFail($id);
        $cpl->delete();
        return response()->json(null, 204);
    }

    private function convertGradeToPct($grade)
    {
        switch ($grade) {
            case 'A': return 95;
            case 'A-': return 90;
            case 'B+': return 85;
            case 'B': return 80;
            case 'B-': return 75;
            case 'C+': return 70;
            case 'C': return 65;
            case 'D': return 50;
            default: return 0;
        }
    }

    public function averages(Request $request)
    {
        $departmentId = $request->query('department_id');
        $angkatan = $request->query('angkatan');
        $kelas = $request->query('kelas');

        $cplQuery = Cpl::query();
        if ($departmentId) $cplQuery->where('department_id', $departmentId);
        $allCpls = $cplQuery->get();

        $studentQuery = \App\Models\Student::query();
        if ($departmentId) $studentQuery->where('department_id', $departmentId);
        if ($angkatan) $studentQuery->where('angkatan', $angkatan);
        if ($kelas) $studentQuery->where('kelas', $kelas);
        
        $studentsList = $studentQuery->get();

        $allMappings = \Illuminate\Support\Facades\DB::table('course_cpl_mappings')
            ->join('courses', 'course_cpl_mappings.course_id', '=', 'courses.id')
            ->select('course_cpl_mappings.cpl_id', 'course_cpl_mappings.course_id', 'course_cpl_mappings.weight', 'courses.sks')
            ->when($departmentId, function($q) use ($departmentId) {
                return $q->where('courses.department_id', $departmentId);
            })->get();

        $allGrades = \Illuminate\Support\Facades\DB::table('student_grades')
            ->join('students', 'student_grades.student_id', '=', 'students.id')
            ->select('student_grades.student_id', 'student_grades.course_id', 'student_grades.grade')
            ->when($departmentId, function($q) use ($departmentId) {
                return $q->where('students.department_id', $departmentId);
            })
            ->when($angkatan, function($q) use ($angkatan) {
                return $q->where('students.angkatan', $angkatan);
            })
            ->when($kelas, function($q) use ($kelas) {
                return $q->where('students.kelas', $kelas);
            })->get();

        $gradesMap = [];
        foreach ($allGrades as $g) {
            $gradesMap[$g->student_id . '_' . $g->course_id] = $g->grade;
        }

        $averages = [];

        foreach ($allCpls as $cpl) {
            $mappings = $allMappings->where('cpl_id', $cpl->id);

            if ($mappings->isEmpty() || $studentsList->isEmpty()) {
                $averages[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'category' => $cpl->category,
                    'value' => 0,
                    'status' => 'Belum Diukur',
                    'target' => $cpl->target_score ?? 70,
                ];
                continue;
            }

            $totalCplSum = 0;
            $studentsMeasured = 0;

            foreach ($studentsList as $student) {
                $totalScoreWeight = 0;
                $totalWeight = 0;
                $takenCoursesCount = 0;

                foreach ($mappings as $map) {
                    $key = $student->id . '_' . $map->course_id;
                    $grade = $gradesMap[$key] ?? null;
                    $multiplier = $map->weight * $map->sks;

                    if ($grade && $grade !== 'Belum Diambil') {
                        $pctValue = $this->convertGradeToPct($grade);
                        $totalScoreWeight += $pctValue * $multiplier;
                        $totalWeight += $multiplier;
                        $takenCoursesCount++;
                    }
                }

                if ($takenCoursesCount > 0 && $totalWeight > 0) {
                    $totalCplSum += round($totalScoreWeight / $totalWeight);
                    $studentsMeasured++;
                }
            }

            if ($studentsMeasured === 0) {
                $averages[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'category' => $cpl->category,
                    'value' => 0,
                    'status' => 'Belum Diukur',
                    'target' => $cpl->target_score ?? 70,
                ];
            } else {
                $value = round($totalCplSum / $studentsMeasured);
                $target = $cpl->target_score ?? 70;
                $status = $value >= $target ? 'Tercapai' : 'Tidak Tercapai';
                
                $averages[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'category' => $cpl->category,
                    'value' => $value,
                    'status' => $status,
                    'target' => $target,
                ];
            }
        }
        
        return response()->json($averages);
    }

    public function achievements(string $studentId)
    {
        $student = \App\Models\Student::findOrFail($studentId);
        $departmentId = $student->department_id;

        $allCpls = Cpl::where('department_id', $departmentId)->get();

        $allMappings = \Illuminate\Support\Facades\DB::table('course_cpl_mappings')
            ->join('courses', 'course_cpl_mappings.course_id', '=', 'courses.id')
            ->select('course_cpl_mappings.cpl_id', 'course_cpl_mappings.course_id', 'course_cpl_mappings.weight', 'courses.sks')
            ->where('courses.department_id', $departmentId)
            ->get();

        $allGrades = \Illuminate\Support\Facades\DB::table('student_grades')
            ->where('student_id', $studentId)
            ->get();

        $gradesMap = [];
        foreach ($allGrades as $g) {
            $gradesMap[$g->course_id] = $g->grade;
        }

        $achievements = [];

        foreach ($allCpls as $cpl) {
            $mappings = $allMappings->where('cpl_id', $cpl->id);

            if ($mappings->isEmpty()) {
                $achievements[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'category' => $cpl->category,
                    'value' => 0,
                    'status' => 'Belum Diukur',
                    'target' => $cpl->target_score ?? 70,
                ];
                continue;
            }

            $totalScoreWeight = 0;
            $totalWeight = 0;
            $takenCoursesCount = 0;

            foreach ($mappings as $map) {
                $grade = $gradesMap[$map->course_id] ?? null;
                $multiplier = $map->weight * $map->sks;

                if ($grade && $grade !== 'Belum Diambil') {
                    $pctValue = $this->convertGradeToPct($grade);
                    $totalScoreWeight += $pctValue * $multiplier;
                    $totalWeight += $multiplier;
                    $takenCoursesCount++;
                }
            }

            if ($takenCoursesCount === 0 || $totalWeight == 0) {
                $achievements[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'category' => $cpl->category,
                    'value' => 0,
                    'status' => 'Belum Diukur',
                    'target' => $cpl->target_score ?? 70,
                ];
            } else {
                $value = round($totalScoreWeight / $totalWeight);
                $target = $cpl->target_score ?? 70;
                $status = $value >= $target ? 'Tercapai' : 'Tidak Tercapai';

                $achievements[] = [
                    'id' => $cpl->id,
                    'code' => $cpl->code,
                    'name' => $cpl->name,
                    'description' => $cpl->description,
                    'category' => $cpl->category,
                    'value' => $value,
                    'status' => $status,
                    'target' => $target,
                ];
            }
        }
        
        return response()->json($achievements);
    }
}
