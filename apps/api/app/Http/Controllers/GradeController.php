<?php

namespace App\Http\Controllers;

use App\Models\StudentGrade;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class GradeController extends Controller
{
    public function index()
    {
        return response()->json(StudentGrade::with(['student', 'course'])->get());
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

    public function byStudent(string $studentId)
    {
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
            $grade = StudentGrade::updateOrCreate(
                [
                    'student_id' => $item['studentId'] ?? $item['student_id'],
                    'course_id' => $item['courseId'] ?? $item['course_id']
                ],
                [
                    'grade' => $item['grade'],
                    'id' => (string) Str::uuid()
                ]
            );
            $inserted[] = $grade;
        }

        return response()->json($inserted);
    }

    public function exportAll(Request $request)
    {
        $grades = StudentGrade::with(['student', 'course'])->get();
        return response()->json($grades);
    }
}
