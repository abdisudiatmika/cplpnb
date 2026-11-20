<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\CpmkCplMapping;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CpmkController extends Controller
{
    public function index(Request $request)
    {
        $departmentId = $this->resolveReadableDepartment($request);

        $query = Cpmk::with(['course.department', 'cplMappings.cpl'])
            ->whereHas('course', fn ($course) => $course->where('department_id', $departmentId))
            ->orderBy('code');

        if ($request->filled('courseId')) {
            $query->where('course_id', $request->string('courseId'));
        }

        if ($request->filled('courseCode')) {
            $query->whereHas('course', fn ($course) => $course->where('code', $request->string('courseCode')));
        }

        return response()->json($query->get()->map(fn (Cpmk $cpmk) => $this->payload($cpmk)));
    }

    public function show(Request $request, Cpmk $cpmk)
    {
        $departmentId = $this->resolveReadableDepartment($request);
        abort_unless($cpmk->course()->where('department_id', $departmentId)->exists(), 403, 'CPMK tidak berada pada jurusan Anda.');

        return response()->json($this->payload($cpmk->load(['course.department', 'cplMappings.cpl'])));
    }

    public function store(Request $request)
    {
        $this->authorizeAdministrator($request->user());
        $departmentId = $this->resolveWritableDepartment($request);
        $data = $this->validatedItem($request->all());

        $cpmk = DB::transaction(function () use ($data, $departmentId) {
            $cpmk = $this->persistItem($data, $departmentId);
            $this->syncCourseMappings($cpmk->course_id);

            return $cpmk;
        });

        return response()->json($this->payload($cpmk->load(['course.department', 'cplMappings.cpl'])), 201);
    }

    public function update(Request $request, Cpmk $cpmk)
    {
        $this->authorizeAdministrator($request->user());
        $departmentId = $this->resolveWritableDepartment($request);
        abort_unless($cpmk->course()->where('department_id', $departmentId)->exists(), 403, 'CPMK tidak berada pada jurusan Anda.');

        $course = Course::where('department_id', $departmentId)->findOrFail($request->input('courseId', $cpmk->course_id));
        $validated = $request->validate([
            'code' => ['sometimes', 'required', 'string', 'max:50', 'regex:/^CPMK[0-9]{2}-[0-9]{2}$/'],
            'description' => 'sometimes|required|string',
            'curriculumVersion' => 'sometimes|nullable|string|max:50',
            'status' => ['sometimes', 'required', Rule::in(['Aktif', 'Nonaktif'])],
            'cplCode' => ['sometimes', 'required', 'string', 'regex:/^CPL-[1-9][0-9]*$/'],
            'contributionWeight' => 'sometimes|numeric|min:0.01|max:100',
        ]);

        $code = strtoupper($validated['code'] ?? $cpmk->code);
        $duplicate = Cpmk::where('course_id', $course->id)->where('code', $code)->whereKeyNot($cpmk->id)->exists();
        throw_if($duplicate, ValidationException::withMessages(['code' => ['Kode CPMK sudah digunakan pada mata kuliah ini.']]));

        DB::transaction(function () use ($validated, $cpmk, $course, $departmentId, $code) {
            $previousCourseId = $cpmk->course_id;
            $cpmk->update([
                'course_id' => $course->id,
                'code' => $code,
                'description' => $validated['description'] ?? $cpmk->description,
                'curriculum_version' => $validated['curriculumVersion'] ?? $cpmk->curriculum_version,
                'status' => $validated['status'] ?? $cpmk->status,
            ]);

            if (isset($validated['cplCode']) || isset($validated['contributionWeight'])) {
                $currentMapping = $cpmk->cplMappings()->first();
                $cplCode = $validated['cplCode'] ?? $currentMapping?->cpl?->code;
                throw_unless($cplCode, ValidationException::withMessages(['cplCode' => ['CPL untuk CPMK ini belum ditentukan.']]));
                $cpl = Cpl::where('department_id', $departmentId)->where('code', strtoupper($cplCode))->firstOrFail();
                $cpmk->cplMappings()->delete();
                CpmkCplMapping::create([
                    'cpmk_id' => $cpmk->id,
                    'cpl_id' => $cpl->id,
                    'contribution_weight' => $validated['contributionWeight'] ?? $currentMapping?->contribution_weight ?? 100,
                ]);
            }

            $this->syncCourseMappings($previousCourseId);
            if ($course->id !== $previousCourseId) {
                $this->syncCourseMappings($course->id);
            }
        });

        return response()->json($this->payload($cpmk->fresh(['course.department', 'cplMappings.cpl'])));
    }

    public function destroy(Request $request, Cpmk $cpmk)
    {
        $this->authorizeAdministrator($request->user());
        $departmentId = $this->resolveWritableDepartment($request);
        abort_unless($cpmk->course()->where('department_id', $departmentId)->exists(), 403, 'CPMK tidak berada pada jurusan Anda.');
        DB::transaction(function () use ($cpmk) {
            $courseId = $cpmk->course_id;
            $cpmk->delete();
            $this->syncCourseMappings($courseId);
        });

        return response()->json(null, 204);
    }

    public function bulk(Request $request)
    {
        $this->authorizeAdministrator($request->user());
        $departmentId = $this->resolveWritableDepartment($request);
        $validated = $request->validate([
            'items' => 'required|array|min:1|max:500',
            'items.*.courseCode' => 'required|string|max:50',
            'items.*.code' => ['required', 'string', 'max:50', 'regex:/^CPMK[0-9]{2}-[0-9]{2}$/'],
            'items.*.description' => 'required|string',
            'items.*.cplCode' => ['required', 'string', 'regex:/^CPL-[1-9][0-9]*$/'],
            'items.*.curriculumVersion' => 'nullable|string|max:50',
            'items.*.status' => ['nullable', Rule::in(['Aktif', 'Nonaktif'])],
            'items.*.contributionWeight' => 'nullable|numeric|min:0.01|max:100',
        ]);

        $keys = collect($validated['items'])->map(fn (array $item) => strtoupper(trim($item['courseCode'])).'/'.strtoupper(trim($item['code'])));
        if ($keys->duplicates()->isNotEmpty()) {
            throw ValidationException::withMessages(['items' => ['Terdapat pasangan mata kuliah dan kode CPMK yang duplikat.']]);
        }

        $created = DB::transaction(function () use ($validated, $departmentId) {
            $created = collect($validated['items'])->map(fn (array $item) => $this->persistItem($this->validatedItem($item), $departmentId));
            $created->pluck('course_id')->unique()->each(fn (string $courseId) => $this->syncCourseMappings($courseId));

            return $created;
        });

        $ids = $created->pluck('id');

        return response()->json(
            Cpmk::with(['course.department', 'cplMappings.cpl'])->whereIn('id', $ids)->get()->map(fn (Cpmk $cpmk) => $this->payload($cpmk)),
            200
        );
    }

    private function persistItem(array $data, string $departmentId): Cpmk
    {
        $course = Course::where('department_id', $departmentId)->where('code', $data['courseCode'])->first();
        $cpl = Cpl::where('department_id', $departmentId)->where('code', $data['cplCode'])->first();

        if (! $course || ! $cpl) {
            throw ValidationException::withMessages([
                'items' => [sprintf('Mata kuliah %s atau %s tidak ditemukan pada jurusan ini.', $data['courseCode'], $data['cplCode'])],
            ]);
        }

        $cpmk = Cpmk::updateOrCreate(
            ['course_id' => $course->id, 'code' => $data['code']],
            [
                'description' => $data['description'],
                'curriculum_version' => $data['curriculumVersion'] ?? null,
                'status' => $data['status'] ?? 'Aktif',
            ]
        );

        CpmkCplMapping::updateOrCreate(
            ['cpmk_id' => $cpmk->id, 'cpl_id' => $cpl->id],
            ['contribution_weight' => $data['contributionWeight'] ?? 100]
        );

        return $cpmk;
    }

    private function validatedItem(array $item): array
    {
        $item['courseCode'] = strtoupper(trim((string) ($item['courseCode'] ?? '')));
        $item['code'] = strtoupper(trim((string) ($item['code'] ?? '')));
        $item['cplCode'] = strtoupper(trim((string) ($item['cplCode'] ?? '')));

        validator($item, [
            'courseCode' => 'required|string|max:50',
            'code' => ['required', 'string', 'max:50', 'regex:/^CPMK[0-9]{2}-[0-9]{2}$/'],
            'description' => 'required|string',
            'cplCode' => ['required', 'string', 'regex:/^CPL-[1-9][0-9]*$/'],
            'curriculumVersion' => 'nullable|string|max:50',
            'status' => ['nullable', Rule::in(['Aktif', 'Nonaktif'])],
            'contributionWeight' => 'nullable|numeric|min:0.01|max:100',
        ])->validate();

        $codeCplNumber = (int) substr($item['code'], 4, 2);
        $targetCplNumber = (int) substr($item['cplCode'], 4);
        if ($codeCplNumber !== $targetCplNumber) {
            throw ValidationException::withMessages(['cplCode' => ['Nomor CPL harus sesuai dengan awalan kode CPMK.']]);
        }

        return $item;
    }

    private function syncCourseMappings(string $courseId): void
    {
        $derivedMappings = CpmkCplMapping::query()
            ->join('cpmks', 'cpmk_cpl_mappings.cpmk_id', '=', 'cpmks.id')
            ->where('cpmks.course_id', $courseId)
            ->where('cpmks.status', 'Aktif')
            ->groupBy('cpmk_cpl_mappings.cpl_id')
            ->selectRaw('cpmk_cpl_mappings.cpl_id, SUM(cpmk_cpl_mappings.contribution_weight) AS weight')
            ->get();

        CourseCplMapping::where('course_id', $courseId)->delete();
        foreach ($derivedMappings as $mapping) {
            CourseCplMapping::create([
                'course_id' => $courseId,
                'cpl_id' => $mapping->cpl_id,
                'weight' => (float) $mapping->weight,
            ]);
        }
    }

    private function resolveReadableDepartment(Request $request): string
    {
        $user = $request->user();
        abort_unless($user, 403, 'Unauthorized');
        $departmentId = $user->role === 'super_admin'
            ? $request->input('departmentId', $request->input('department_id'))
            : $user->department_id;
        abort_unless($departmentId, 422, 'Jurusan belum ditentukan.');

        return $departmentId;
    }

    private function resolveWritableDepartment(Request $request): string
    {
        return $this->resolveReadableDepartment($request);
    }

    private function authorizeAdministrator(?User $user): void
    {
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
    }

    private function payload(Cpmk $cpmk): array
    {
        $mapping = $cpmk->cplMappings->first();

        return [
            'id' => $cpmk->id,
            'code' => $cpmk->code,
            'description' => $cpmk->description,
            'curriculumVersion' => $cpmk->curriculum_version,
            'status' => $cpmk->status,
            'courseId' => $cpmk->course_id,
            'courseCode' => $cpmk->course?->code,
            'courseName' => $cpmk->course?->name,
            'cplId' => $mapping?->cpl_id,
            'cplCode' => $mapping?->cpl?->code,
            'contributionWeight' => $mapping?->contribution_weight,
        ];
    }
}
