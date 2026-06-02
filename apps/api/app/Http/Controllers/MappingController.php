<?php

namespace App\Http\Controllers;

use App\Models\CourseCplMapping;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MappingController extends Controller
{
    public function index(Request $request)
    {
        $courseId = $request->query('courseId', $request->query('course_id'));
        $query = CourseCplMapping::with(['course', 'cpl']);
        if ($courseId) {
            $query->where('course_id', $courseId);
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $courseId = $request->input('courseId', $request->input('course_id'));
        $cplId = $request->input('cplId', $request->input('cpl_id'));

        $request->merge([
            'course_id' => $courseId,
            'cpl_id' => $cplId,
        ]);

        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'cpl_id' => 'required|exists:cpls,id',
            'weight' => 'required|numeric|min:0',
        ]);

        $validated['id'] = (string) Str::uuid();

        $mapping = CourseCplMapping::create($validated);
        return response()->json($mapping->load(['course', 'cpl']), 201);
    }

    public function show(string $id)
    {
        $mapping = CourseCplMapping::with(['course', 'cpl'])->findOrFail($id);
        return response()->json($mapping);
    }

    public function update(Request $request, string $id)
    {
        $mapping = CourseCplMapping::findOrFail($id);

        $courseId = $request->input('courseId', $request->input('course_id'));
        $cplId = $request->input('cplId', $request->input('cpl_id'));

        if ($courseId) $request->merge(['course_id' => $courseId]);
        if ($cplId) $request->merge(['cpl_id' => $cplId]);

        $validated = $request->validate([
            'course_id' => 'sometimes|required|exists:courses,id',
            'cpl_id' => 'sometimes|required|exists:cpls,id',
            'weight' => 'sometimes|required|numeric|min:0',
        ]);

        $mapping->update($validated);
        return response()->json($mapping->load(['course', 'cpl']));
    }

    public function destroy(string $id)
    {
        $mapping = CourseCplMapping::findOrFail($id);
        $mapping->delete();
        return response()->json(null, 204);
    }
}
