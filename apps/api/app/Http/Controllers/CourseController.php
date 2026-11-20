<?php

namespace App\Http\Controllers;

use App\Models\Course;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CourseController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Course::with('department');
        if ($user && $user->role === 'admin_jurusan') {
            $query->where('department_id', $user->department_id);
        }
        $this->scopeToCurriculum($query, $this->currentCurriculum($request));
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
            'code' => 'required|string|max:50',
            'name' => 'required|string|max:255',
            'sks' => 'required|integer|min:1',
            'semester' => 'nullable|integer|min:1|max:14',
            'department_id' => 'required|exists:departments,id',
        ]);

        $validated['id'] = (string) Str::uuid();
        $validated['curriculum_id'] = $this->currentCurriculum($request, $validated['department_id'])?->id;

        $course = Course::create($validated);
        return response()->json($course->load('department'), 201);
    }

    public function show(Request $request, string $id)
    {
        $course = Course::with('department')->findOrFail($id);
        $this->ensureSameDepartment($request, $course->department_id);
        return response()->json($course);
    }

    public function update(Request $request, string $id)
    {
        $course = Course::findOrFail($id);
        $this->ensureSameDepartment($request, $course->department_id);
        $this->pinDepartment($request);

        $departmentId = $request->input('departmentId', $request->input('department_id'));
        if ($departmentId !== null) {
            $request->merge(['department_id' => $departmentId]);
        }

        $validated = $request->validate([
            'code' => 'sometimes|required|string|max:50',
            'name' => 'sometimes|required|string|max:255',
            'sks' => 'sometimes|required|integer|min:1',
            'semester' => 'sometimes|nullable|integer|min:1|max:14',
            'department_id' => 'sometimes|required|exists:departments,id',
        ]);

        $course->update($validated);
        return response()->json($course->load('department'));
    }

    public function destroy(Request $request, string $id)
    {
        $course = Course::findOrFail($id);
        $this->ensureSameDepartment($request, $course->department_id);
        $course->delete();
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
            'items.*.code' => 'required|string|max:50|distinct',
            'items.*.name' => 'required|string|max:255',
            'items.*.sks' => 'required|integer|min:1',
            'items.*.semester' => 'nullable|integer|min:1|max:14',
        ]);

        $now = now();
        $curriculumId = $this->currentCurriculum($request, $departmentId)?->id;
        $courseIds = DB::transaction(function () use ($validated, $departmentId, $curriculumId, $now) {
            return collect($validated['items'])->map(function ($item) use ($departmentId, $curriculumId, $now) {
                $course = Course::firstOrNew([
                    'department_id' => $departmentId,
                    'curriculum_id' => $curriculumId,
                    'code' => $item['code'],
                ]);

                if (!$course->exists) {
                    $course->id = (string) Str::uuid();
                    $course->created_at = $now;
                }

                $course->name = $item['name'];
                $course->sks = $item['sks'];
                $course->semester = $item['semester'] ?? null;
                $course->updated_at = $now;
                $course->save();

                return $course->id;
            });
        });

        return response()->json(
            Course::with('department')->whereIn('id', $courseIds)->get(),
            201
        );
    }

    public function bulkDelete(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'required|string',
        ]);

        $query = Course::whereIn('id', $validated['ids']);

        if ($request->user()?->role === 'admin_jurusan') {
            $query->where('department_id', $request->user()->department_id);
        }

        $idsToDelete = $query->pluck('id');

        if ($idsToDelete->isEmpty()) {
            return response()->json(['message' => 'Tidak ada mata kuliah yang cocok untuk dihapus.', 'count' => 0]);
        }

        Course::whereIn('id', $idsToDelete)->delete();

        return response()->json([
            'message' => 'Mata kuliah berhasil dihapus secara massal',
            'count' => $idsToDelete->count(),
        ]);
    }

    public function mapping(Request $request, string $cplCode)
    {
        $departmentId = $request->user()?->department_id;
        if (!$departmentId) {
            return response()->json(['error' => 'User does not belong to a department.'], 400);
        }

        $cpl = $this->scopeToCurriculum(\App\Models\Cpl::where('code', $cplCode)
            ->where('department_id', $departmentId), $this->currentCurriculum($request, $departmentId))
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
