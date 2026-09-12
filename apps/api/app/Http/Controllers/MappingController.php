<?php

namespace App\Http\Controllers;

use App\Models\CourseCplMapping;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
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
        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan') {
            $query->whereHas('course', function($q) use ($user) {
                $q->where('department_id', $user->department_id);
            });
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

    public function bulk(Request $request)
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
        ]);

        $items = collect($validated['items'])
            ->map(function ($item) {
                return [
                    'course_id' => $item['courseId'] ?? $item['course_id'],
                    'cpl_id' => $item['cplId'] ?? $item['cpl_id'],
                    'weight' => $item['weight'],
                ];
            })
            ->unique(fn ($item) => $item['course_id'] . ':' . $item['cpl_id'])
            ->values();

        Validator::make(['items' => $items->all()], [
            'items.*.course_id' => 'required|string|exists:courses,id',
            'items.*.cpl_id' => 'required|string|exists:cpls,id',
            'items.*.weight' => 'required|numeric|min:0',
        ])->validate();

        $user = $request->user();
        if ($user && $user->role === 'admin_jurusan') {
            $departmentId = $user->department_id;
            $courseCount = DB::table('courses')
                ->whereIn('id', $items->pluck('course_id'))
                ->where('department_id', $departmentId)
                ->count();
            $cplCount = DB::table('cpls')
                ->whereIn('id', $items->pluck('cpl_id'))
                ->where('department_id', $departmentId)
                ->count();

            if ($courseCount !== $items->pluck('course_id')->unique()->count() ||
                $cplCount !== $items->pluck('cpl_id')->unique()->count()) {
                return response()->json([
                    'message' => 'Sebagian mata kuliah atau CPL tidak berada pada jurusan Anda.',
                ], 403);
            }
        }

        $now = now();
        $mappingIds = [];

        DB::transaction(function () use ($items, $now, &$mappingIds) {
            foreach ($items as $item) {
                $mapping = CourseCplMapping::updateOrCreate(
                    [
                        'course_id' => $item['course_id'],
                        'cpl_id' => $item['cpl_id'],
                    ],
                    [
                        'weight' => $item['weight'],
                        'updated_at' => $now,
                    ]
                );

                $mappingIds[] = $mapping->id;
            }
        });

        return response()->json(
            CourseCplMapping::with(['course', 'cpl'])->whereIn('id', $mappingIds)->get(),
            201
        );
    }
}
