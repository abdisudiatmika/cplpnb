<?php

namespace App\Http\Controllers;

use App\Models\Cpl;
use App\Models\GraduateProfile;
use App\Models\GraduateProfileCpl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class GraduateProfileController extends Controller
{
    public function index(Request $request)
    {
        $departmentId = $this->departmentId($request);
        return response()->json($this->scopeToCurriculum(GraduateProfile::with('cplMappings.cpl')
            ->where('department_id', $departmentId), $this->currentCurriculum($request, $departmentId))
            ->orderBy('sequence')->orderBy('code')->get()->map(fn ($profile) => $this->payload($profile)));
    }

    public function store(Request $request)
    {
        $departmentId = $this->departmentId($request);
        $curriculum = $this->currentCurriculum($request, $departmentId);
        $validated = $this->validated($request, $departmentId, null, $curriculum);
        $profile = DB::transaction(function () use ($validated, $departmentId, $curriculum) {
            $profile = GraduateProfile::create([
                'department_id' => $departmentId,
                'curriculum_id' => $curriculum?->id,
                'code' => strtoupper($validated['code']),
                'name' => $validated['name'],
                'english_name' => $validated['englishName'] ?? null,
                'summary' => $validated['summary'],
                'curriculum_version' => $validated['curriculumVersion'],
                'status' => $validated['status'],
                'sequence' => $validated['sequence'],
            ]);
            if (array_key_exists('cplMappings', $validated)) $this->syncMappings($profile, $validated['cplMappings'], $departmentId);
            return $profile;
        });
        return response()->json($this->payload($profile->load('cplMappings.cpl')), 201);
    }

    public function update(Request $request, GraduateProfile $graduateProfile)
    {
        $departmentId = $this->departmentId($request);
        abort_unless($graduateProfile->department_id === $departmentId, 403);
        $validated = $this->validated($request, $departmentId, $graduateProfile, $graduateProfile->curriculum);
        DB::transaction(function () use ($graduateProfile, $validated, $departmentId) {
            $graduateProfile->update([
                'code' => strtoupper($validated['code']), 'name' => $validated['name'],
                'english_name' => $validated['englishName'] ?? null, 'summary' => $validated['summary'],
                'curriculum_version' => $validated['curriculumVersion'], 'status' => $validated['status'],
                'sequence' => $validated['sequence'],
            ]);
            if (array_key_exists('cplMappings', $validated)) $this->syncMappings($graduateProfile, $validated['cplMappings'], $departmentId);
        });
        return response()->json($this->payload($graduateProfile->fresh()->load('cplMappings.cpl')));
    }

    public function destroy(Request $request, GraduateProfile $graduateProfile)
    {
        abort_unless($graduateProfile->department_id === $this->departmentId($request), 403);
        $graduateProfile->delete();
        return response()->noContent();
    }

    private function validated(Request $request, string $departmentId, ?GraduateProfile $profile = null, ?\App\Models\Curriculum $curriculumModel = null): array
    {
        $curriculum = $request->input('curriculumVersion', $curriculumModel?->code ?? '2026');
        $request->merge(['code' => strtoupper(trim((string) $request->input('code'))), 'curriculumVersion' => $curriculum]);
        $uniqueCode = $curriculumModel
            ? Rule::unique('graduate_profiles')->where(fn ($q) => $q->where('curriculum_id', $curriculumModel->id))
            : Rule::unique('graduate_profiles')->where(fn ($q) => $q->where('department_id', $departmentId)->where('curriculum_version', $curriculum));
        return $request->validate([
            'code' => ['required', 'regex:/^PL-[1-9][0-9]*$/', $uniqueCode->ignore($profile?->id)],
            'name' => 'required|string|max:255', 'englishName' => 'nullable|string|max:255',
            'summary' => 'required|string|max:5000', 'curriculumVersion' => 'required|string|max:20',
            'status' => ['required', Rule::in(['Aktif', 'Nonaktif'])], 'sequence' => 'required|integer|min:1|max:999',
            'cplMappings' => 'sometimes|array', 'cplMappings.*.cplId' => 'required|uuid|distinct|exists:cpls,id',
            'cplMappings.*.type' => ['required', Rule::in(['core', 'supporting'])],
        ]);
    }

    private function syncMappings(GraduateProfile $profile, array $mappings, string $departmentId): void
    {
        $cplIds = collect($mappings)->pluck('cplId');
        $cplQuery = Cpl::where('department_id', $departmentId)->whereIn('id', $cplIds);
        if ($profile->curriculum_id) {
            $cplQuery->where('curriculum_id', $profile->curriculum_id);
        }
        abort_unless($cplQuery->count() === $cplIds->count(), 422, 'Seluruh CPL harus berasal dari jurusan dan kurikulum yang sama.');
        $profile->cplMappings()->delete();
        foreach ($mappings as $mapping) GraduateProfileCpl::create(['graduate_profile_id' => $profile->id, 'cpl_id' => $mapping['cplId'], 'contribution_type' => $mapping['type']]);
    }

    private function departmentId(Request $request): string
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'admin_jurusan' && $user->department_id, 403);
        return $user->department_id;
    }

    private function payload(GraduateProfile $profile): array
    {
        return ['id' => $profile->id, 'code' => $profile->code, 'name' => $profile->name, 'englishName' => $profile->english_name,
            'summary' => $profile->summary, 'curriculumVersion' => $profile->curriculum_version, 'status' => $profile->status,
            'sequence' => $profile->sequence, 'cplMappings' => $profile->cplMappings->map(fn ($mapping) => ['cplId' => $mapping->cpl_id, 'cplCode' => $mapping->cpl?->code, 'type' => $mapping->contribution_type])->values()];
    }
}
