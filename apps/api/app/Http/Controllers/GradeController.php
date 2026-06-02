<?php

namespace App\Http\Controllers;

use App\Models\StudentGrade;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class GradeController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = StudentGrade::with(['student', 'course']);
        if ($user && $user->role === 'admin_jurusan') {
            $query->whereHas('student', function($q) use ($user) {
                $q->where('department_id', $user->department_id);
            });
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $studentId = $request->input('studentId', $request->input('student_id'));
        $courseId = $request->input('courseId', $request->input('course_id'));

        $request->merge([
            'student_id' => $studentId,
            'course_id' => $courseId,
        ]);

        $validated = $request->validate([
            'student_id' => 'required|exists:students,id',
            'course_id' => 'required|exists:courses,id',
            'grade' => 'required|string|max:10',
            'score' => 'nullable|numeric|min:0|max:100',
            'semester' => 'nullable|string|max:50',
            'academic_year' => 'nullable|string|max:50',
        ]);

        $validated['id'] = (string) Str::uuid();

        $grade = StudentGrade::create($validated);
        return response()->json($grade->load(['student', 'course']), 201);
    }

    public function show(string $id)
    {
        $grade = StudentGrade::with(['student', 'course'])->findOrFail($id);
        return response()->json($grade);
    }

    public function update(Request $request, string $id)
    {
        $grade = StudentGrade::findOrFail($id);

        $studentId = $request->input('studentId', $request->input('student_id'));
        $courseId = $request->input('courseId', $request->input('course_id'));

        if ($studentId) $request->merge(['student_id' => $studentId]);
        if ($courseId) $request->merge(['course_id' => $courseId]);

        $validated = $request->validate([
            'student_id' => 'sometimes|required|exists:students,id',
            'course_id' => 'sometimes|required|exists:courses,id',
            'grade' => 'sometimes|required|string|max:10',
            'score' => 'nullable|numeric|min:0|max:100',
            'semester' => 'nullable|string|max:50',
            'academic_year' => 'nullable|string|max:50',
        ]);

        $grade->update($validated);
        return response()->json($grade->load(['student', 'course']));
    }

    public function destroy(string $id)
    {
        $grade = StudentGrade::findOrFail($id);
        $grade->delete();
        return response()->json(null, 204);
    }

    public function byStudent(Request $request, string $studentId)
    {
        $student = \App\Models\Student::findOrFail($studentId);
        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan' && $student->department_id !== $user->department_id) {
            abort(403, 'Unauthorized');
        }

        $grades = StudentGrade::with(['course'])->where('student_id', $studentId)->get()->map(function ($g) {
            if ($g->course) {
                $g->courseCode = $g->course->code;
                $g->courseName = $g->course->name;
                $g->sks = $g->course->sks;
                $g->semester = $g->course->semester; // Or $g->semester if stored on grade
                $g->academicYear = $g->academic_year;
            }
            return $g;
        });
        return response()->json($grades);
    }

    public function bulk(Request $request)
    {
        $items = $request->input('items', []);
        $inserted = [];
        
        foreach ($items as $item) {
            $studentId = $item['studentId'] ?? $item['student_id'] ?? null;
            $courseId = $item['courseId'] ?? $item['course_id'] ?? null;
            
            if (!$studentId || !$courseId) {
                continue;
            }

            $grade = StudentGrade::where('student_id', $studentId)
                ->where('course_id', $courseId)
                ->first();

            if ($grade) {
                $updateData = ['grade' => $item['grade']];
                if (isset($item['score'])) {
                    $updateData['score'] = $item['score'];
                }
                $grade->update($updateData);
            } else {
                $grade = StudentGrade::create([
                    'id' => (string) Str::uuid(),
                    'student_id' => $studentId,
                    'course_id' => $courseId,
                    'grade' => $item['grade'],
                    'score' => $item['score'] ?? 0,
                    'semester' => $item['semester'] ?? '1',
                    'academic_year' => $item['academicYear'] ?? $item['academic_year'] ?? '2024/2025',
                ]);
            }
            $inserted[] = $grade;
        }

        return response()->json($inserted);
    }

    public function exportAll(Request $request)
    {
        $user = $request->user();
        $query = StudentGrade::with(['student', 'course']);
        if ($user && $user->role === 'admin_jurusan') {
            $query->whereHas('student', function($q) use ($user) {
                $q->where('department_id', $user->department_id);
            });
        }
        $grades = $query->get();
        return response()->json($grades);
    }
}
