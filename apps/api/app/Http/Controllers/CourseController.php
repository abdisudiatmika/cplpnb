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
}
