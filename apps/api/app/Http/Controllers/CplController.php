<?php

namespace App\Http\Controllers;

use App\Models\Cpl;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CplController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Cpl::with('department');
        if ($user && $user->role === 'admin_jurusan') {
            $query->where('department_id', $user->department_id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $targetValue = $request->input('targetValue', $request->input('target_value'));
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        if ($departmentId === null && $request->user()) {
            $departmentId = $request->user()->department_id;
        }

        $request->merge([
            'target_value' => $targetValue,
            'department_id' => $departmentId,
        ]);

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

        $targetValue = $request->input('targetValue', $request->input('target_value'));
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        if ($targetValue !== null) $request->merge(['target_value' => $targetValue]);
        if ($departmentId !== null) $request->merge(['department_id' => $departmentId]);

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
            case 'AB': return 85;
            case 'A-': return 90;
            case 'B+': return 85;
            case 'B': return 75;
            case 'BC': return 65;
            case 'B-': return 75;
            case 'C+': return 70;
            case 'C': return 60;
            case 'D': return 50;
            default: return 0;
        }
    }

    public function averages(Request $request)
    {
        $user = $request->user();
        $departmentId = ($user && $user->role === 'admin_jurusan') ? $user->department_id : $request->query('department_id', $request->query('departmentId'));
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
                    'target' => $cpl->target_value ?? 70,
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
                    'target' => $cpl->target_value ?? 70,
                ];
            } else {
                $value = round($totalCplSum / $studentsMeasured);
                $target = $cpl->target_value ?? 70;
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

    public function achievements(Request $request, string $studentId)
    {
        $student = \App\Models\Student::findOrFail($studentId);
        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan' && $student->department_id !== $user->department_id) {
            abort(403, 'Unauthorized');
        }
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
                    'target' => $cpl->target_value ?? 70,
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
                    'target' => $cpl->target_value ?? 70,
                ];
            } else {
                $value = round($totalScoreWeight / $totalWeight);
                $target = $cpl->target_value ?? 70;
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
