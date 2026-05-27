<?php

namespace App\Http\Controllers;

use App\Models\CourseCplMapping;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MappingController extends Controller
{
    public function index()
    {
        return response()->json(CourseCplMapping::with(['course', 'cpl'])->get());
    }

    public function store(Request $request)
    {
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
