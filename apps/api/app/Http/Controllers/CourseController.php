<?php

namespace App\Http\Controllers;

use App\Models\Course;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CourseController extends Controller
{
    public function index()
    {
        return response()->json(Course::with('department')->get());
    }

    public function store(Request $request)
    {
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        if ($departmentId === null && $request->user()) {
            $departmentId = $request->user()->department_id;
        }

        $request->merge(['department_id' => $departmentId]);

        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'name' => 'required|string|max:255',
            'sks' => 'required|integer|min:1',
            'department_id' => 'required|exists:departments,id',
        ]);

        $validated['id'] = (string) Str::uuid();

        $course = Course::create($validated);
        return response()->json($course->load('department'), 201);
    }

    public function show(string $id)
    {
        $course = Course::with('department')->findOrFail($id);
        return response()->json($course);
    }

    public function update(Request $request, string $id)
    {
        $course = Course::findOrFail($id);

        $departmentId = $request->input('departmentId', $request->input('department_id'));
        if ($departmentId !== null) {
            $request->merge(['department_id' => $departmentId]);
        }

        $validated = $request->validate([
            'code' => 'sometimes|required|string|max:50',
            'name' => 'sometimes|required|string|max:255',
            'sks' => 'sometimes|required|integer|min:1',
            'department_id' => 'sometimes|required|exists:departments,id',
        ]);

        $course->update($validated);
        return response()->json($course->load('department'));
    }

    public function destroy(string $id)
    {
        $course = Course::findOrFail($id);
        $course->delete();
        return response()->json(null, 204);
    }

    public function mapping(Request $request, string $cplCode)
    {
        $departmentId = $request->user()?->department_id;
        if (!$departmentId) {
            return response()->json(['error' => 'User does not belong to a department.'], 400);
        }

        $cpl = \App\Models\Cpl::where('code', $cplCode)
            ->where('department_id', $departmentId)
            ->first();

        if (!$cpl) {
            return response()->json([]);
        }

        $studentId = $request->query('studentId');

        $query = \App\Models\CourseCplMapping::with(['course'])
            ->where('cpl_id', $cpl->id)
            ->whereHas('course', function ($q) use ($departmentId) {
                $q->where('department_id', $departmentId);
            });

        $results = $query->get();

        if ($studentId) {
            $grades = \Illuminate\Support\Facades\DB::table('student_grades')
                ->where('student_id', $studentId)
                ->get()
                ->keyBy('course_id');

            $mapped = $results->map(function ($map) use ($grades) {
                $course = $map->course;
                if (!$course) {
                    return null;
                }
                $grade = $grades->get($course->id);
                return [
                    'code' => $course->code,
                    'name' => $course->name,
                    'sks' => $course->sks,
                    'grade' => $grade ? $grade->grade : 'Belum Diambil',
                    'score' => $grade ? ($grade->score !== null ? $grade->score : 0) : 0,
                ];
            })->filter()->values();

            return response()->json($mapped);
        } else {
            $mapped = $results->map(function ($map) {
                $course = $map->course;
                if (!$course) {
                    return null;
                }
                return [
                    'code' => $course->code,
                    'name' => $course->name,
                    'sks' => $course->sks,
                ];
            })->filter()->values();

            return response()->json($mapped);
        }
    }
}
