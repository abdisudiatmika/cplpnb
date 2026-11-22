<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\CpmkCplMapping;
use App\Models\Curriculum;
use App\Models\GraduateProfile;
use App\Models\GraduateProfileCpl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CurriculumController extends Controller
{
    public function index(Request $request)
    {
        $departmentId = $this->departmentIdOrFail($request);

        $curricula = Curriculum::where('department_id', $departmentId)
            ->withCount(['courses', 'cpls', 'graduateProfiles'])
            ->orderByDesc('is_default')
            ->orderByDesc('cohort_from')
            ->orderBy('name')
            ->get();

        return response()->json($curricula->map(fn (Curriculum $curriculum) => $this->payload($curriculum)));
    }

    public function store(Request $request)
    {
        $departmentId = $this->departmentIdOrFail($request);
        $validated = $this->validated($request, $departmentId);
        if (($validated['status'] ?? 'Aktif') === 'Aktif') {
            $this->ensureNoCohortOverlap($departmentId, $validated['cohortFrom'] ?? null, $validated['cohortTo'] ?? null);
        }
        $request->validate([
            'copyFromId' => ['nullable', 'uuid', Rule::exists('curricula', 'id')->where('department_id', $departmentId)],
        ]);

        $curriculum = DB::transaction(function () use ($validated, $departmentId, $request) {
            $isFirst = ! Curriculum::where('department_id', $departmentId)->exists();
            $curriculum = Curriculum::create([
                'department_id' => $departmentId,
                'code' => $validated['code'],
                'name' => $validated['name'],
                'cohort_from' => $validated['cohortFrom'] ?? null,
                'cohort_to' => $validated['cohortTo'] ?? null,
                'status' => $validated['status'] ?? 'Aktif',
                'is_default' => $isFirst,
                'notes' => $validated['notes'] ?? null,
            ]);

            if ($request->filled('copyFromId')) {
                $this->copyStructure(Curriculum::findOrFail($request->input('copyFromId')), $curriculum);
            }

            return $curriculum;
        });

        return response()->json($this->payload($curriculum->loadCount(['courses', 'cpls', 'graduateProfiles'])), 201);
    }

    public function update(Request $request, Curriculum $curriculum)
    {
        $departmentId = $this->departmentIdOrFail($request);
        abort_unless($curriculum->department_id === $departmentId, 404, 'Kurikulum tidak ditemukan.');
        $validated = $this->validated($request, $departmentId, $curriculum);
        abort_if(($validated['status'] ?? $curriculum->status) === 'Nonaktif' && $curriculum->is_default, 422, 'Kurikulum aktif tidak dapat dinonaktifkan. Aktifkan kurikulum lain terlebih dahulu.');
        if (($validated['status'] ?? $curriculum->status) === 'Aktif') {
            $this->ensureNoCohortOverlap($departmentId, $validated['cohortFrom'] ?? null, $validated['cohortTo'] ?? null, $curriculum);
        }

        $curriculum->update([
            'code' => $validated['code'],
            'name' => $validated['name'],
            'cohort_from' => $validated['cohortFrom'] ?? null,
            'cohort_to' => $validated['cohortTo'] ?? null,
            'status' => $validated['status'] ?? $curriculum->status,
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json($this->payload($curriculum->fresh()->loadCount(['courses', 'cpls', 'graduateProfiles'])));
    }

    public function activate(Request $request, Curriculum $curriculum)
    {
        $departmentId = $this->departmentIdOrFail($request);
        abort_unless($curriculum->department_id === $departmentId, 404, 'Kurikulum tidak ditemukan.');
        if ($curriculum->status !== 'Aktif') {
            $this->ensureNoCohortOverlap($departmentId, $curriculum->cohort_from, $curriculum->cohort_to, $curriculum);
        }

        DB::transaction(function () use ($curriculum, $departmentId) {
            Curriculum::where('department_id', $departmentId)->update(['is_default' => false]);
            $curriculum->update(['is_default' => true, 'status' => 'Aktif']);
        });

        return $this->index($request);
    }

    public function destroy(Request $request, Curriculum $curriculum)
    {
        $departmentId = $this->departmentIdOrFail($request);
        abort_unless($curriculum->department_id === $departmentId, 404, 'Kurikulum tidak ditemukan.');
        abort_if($curriculum->is_default, 422, 'Kurikulum aktif tidak dapat dihapus.');
        $curriculum->loadCount(['courses', 'cpls', 'graduateProfiles']);
        abort_if(
            $curriculum->courses_count + $curriculum->cpls_count + $curriculum->graduate_profiles_count > 0,
            422,
            'Kurikulum masih memiliki mata kuliah, CPL, atau profil lulusan sehingga tidak dapat dihapus.'
        );

        $curriculum->delete();

        return response()->json(null, 204);
    }

    /**
     * Kurikulum berstatus Aktif yang punya rentang angkatan tidak boleh saling tumpang tindih,
     * supaya setiap angkatan jelas memakai satu kurikulum. Satu kurikulum "Semua angkatan"
     * (tanpa rentang) boleh ada sebagai cadangan untuk angkatan yang tidak tercakup.
     */
    private function ensureNoCohortOverlap(string $departmentId, $from, $to, ?Curriculum $ignore = null): void
    {
        $from = $from === null || $from === '' ? null : (int) $from;
        $to = $to === null || $to === '' ? null : (int) $to;
        $unbounded = $from === null && $to === null;

        $conflict = Curriculum::where('department_id', $departmentId)
            ->where('status', 'Aktif')
            ->when($ignore, fn ($query) => $query->where('id', '!=', $ignore->id))
            ->get()
            ->first(function (Curriculum $other) use ($from, $to, $unbounded) {
                $otherUnbounded = $other->cohort_from === null && $other->cohort_to === null;
                if ($unbounded || $otherUnbounded) {
                    return $unbounded && $otherUnbounded;
                }

                return ($from === null || $other->cohort_to === null || $from <= $other->cohort_to)
                    && ($to === null || $other->cohort_from === null || $other->cohort_from <= $to);
            });

        if ($conflict) {
            $range = $this->cohortRangeLabel($conflict->cohort_from, $conflict->cohort_to);
            $message = $unbounded
                ? 'Sudah ada kurikulum aktif untuk semua angkatan ('.$conflict->name.'). Isi rentang angkatan, atau nonaktifkan kurikulum tersebut terlebih dahulu.'
                : 'Rentang angkatan tumpang tindih dengan '.$conflict->name.' ('.$range.'). Ubah rentang angkatan salah satu kurikulum agar setiap angkatan hanya memakai satu kurikulum.';

            throw ValidationException::withMessages(['cohortFrom' => [$message]]);
        }
    }

    private function cohortRangeLabel(?int $from, ?int $to): string
    {
        if ($from !== null && $to === null) {
            return 'angkatan '.$from.' dst.';
        }
        if ($from === null && $to !== null) {
            return 's.d. angkatan '.$to;
        }

        return $from === $to ? 'angkatan '.$from : 'angkatan '.$from.'–'.$to;
    }

    private function departmentIdOrFail(Request $request): string
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        $departmentId = $this->curriculumDepartmentId($request);
        abort_unless($departmentId, 422, 'Jurusan belum ditentukan.');

        return $departmentId;
    }

    private function validated(Request $request, string $departmentId, ?Curriculum $curriculum = null): array
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20', 'regex:/^[A-Z0-9][A-Z0-9._-]*$/',
                Rule::unique('curricula', 'code')->where('department_id', $departmentId)->ignore($curriculum?->id)],
            'name' => 'required|string|max:100',
            'cohortFrom' => 'nullable|integer|min:1990|max:2100',
            'cohortTo' => array_merge(['nullable', 'integer', 'min:1990', 'max:2100'], $request->filled('cohortFrom') ? ['gte:cohortFrom'] : []),
            'status' => ['nullable', Rule::in(['Aktif', 'Nonaktif'])],
            'notes' => 'nullable|string|max:2000',
        ], [
            'code.regex' => 'Kode kurikulum hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.',
            'code.unique' => 'Kode kurikulum sudah digunakan pada jurusan ini.',
            'cohortTo.gte' => 'Angkatan akhir tidak boleh lebih kecil dari angkatan awal.',
        ]);

        return $validated;
    }

    /**
     * Salin MK, CPL, pemetaan MK-CPL, CPMK, dan profil lulusan ke kurikulum baru.
     * Nilai, rencana asesmen, dan penugasan tidak disalin.
     */
    private function copyStructure(Curriculum $source, Curriculum $target): void
    {
        $cplIds = [];
        foreach (Cpl::where('curriculum_id', $source->id)->get() as $cpl) {
            $copy = $cpl->replicate(['id']);
            $copy->curriculum_id = $target->id;
            $copy->save();
            $cplIds[$cpl->id] = $copy->id;
        }

        $courseIds = [];
        foreach (Course::where('curriculum_id', $source->id)->get() as $course) {
            $copy = $course->replicate(['id']);
            $copy->curriculum_id = $target->id;
            $copy->save();
            $courseIds[$course->id] = $copy->id;
        }

        foreach (CourseCplMapping::whereIn('course_id', array_keys($courseIds))->get() as $mapping) {
            if (isset($cplIds[$mapping->cpl_id])) {
                CourseCplMapping::create([
                    'course_id' => $courseIds[$mapping->course_id],
                    'cpl_id' => $cplIds[$mapping->cpl_id],
                    'weight' => $mapping->weight,
                ]);
            }
        }

        foreach (Cpmk::with('cplMappings')->whereIn('course_id', array_keys($courseIds))->get() as $cpmk) {
            $copy = $cpmk->replicate(['id']);
            $copy->course_id = $courseIds[$cpmk->course_id];
            $copy->curriculum_version = $target->code;
            $copy->save();
            foreach ($cpmk->cplMappings as $mapping) {
                if (isset($cplIds[$mapping->cpl_id])) {
                    CpmkCplMapping::create([
                        'cpmk_id' => $copy->id,
                        'cpl_id' => $cplIds[$mapping->cpl_id],
                        'contribution_weight' => $mapping->contribution_weight,
                    ]);
                }
            }
        }

        foreach (GraduateProfile::with('cplMappings')->where('curriculum_id', $source->id)->get() as $profile) {
            $copy = $profile->replicate(['id']);
            $copy->curriculum_id = $target->id;
            $copy->curriculum_version = $target->code;
            $copy->save();
            foreach ($profile->cplMappings as $mapping) {
                if (isset($cplIds[$mapping->cpl_id])) {
                    GraduateProfileCpl::create([
                        'graduate_profile_id' => $copy->id,
                        'cpl_id' => $cplIds[$mapping->cpl_id],
                        'contribution_type' => $mapping->contribution_type,
                    ]);
                }
            }
        }
    }

    private function payload(Curriculum $curriculum): array
    {
        return [
            'id' => $curriculum->id,
            'code' => $curriculum->code,
            'name' => $curriculum->name,
            'cohortFrom' => $curriculum->cohort_from,
            'cohortTo' => $curriculum->cohort_to,
            'status' => $curriculum->status,
            'isDefault' => (bool) $curriculum->is_default,
            'notes' => $curriculum->notes,
            'coursesCount' => $curriculum->courses_count ?? null,
            'cplsCount' => $curriculum->cpls_count ?? null,
            'graduateProfilesCount' => $curriculum->graduate_profiles_count ?? null,
        ];
    }
}
