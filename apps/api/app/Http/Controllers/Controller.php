<?php

namespace App\Http\Controllers;

use App\Models\Curriculum;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;

class Controller extends BaseController
{
    use AuthorizesRequests, ValidatesRequests;

    /**
     * Admin prodi hanya boleh bekerja pada data prodinya sendiri.
     */
    protected function isDepartmentAdmin(Request $request): bool
    {
        return $request->user()?->role === 'admin_jurusan';
    }

    /**
     * Tolak (404) bila admin prodi mengakses data milik prodi lain.
     */
    protected function ensureSameDepartment(Request $request, ?string $departmentId): void
    {
        if ($this->isDepartmentAdmin($request) && $departmentId !== $request->user()->department_id) {
            abort(404, 'Data tidak ditemukan.');
        }
    }

    /**
     * Untuk admin prodi, paksa department_id ke prodi akunnya (input dari klien diabaikan).
     */
    protected function pinDepartment(Request $request): void
    {
        if ($this->isDepartmentAdmin($request)) {
            $departmentId = $request->user()->department_id;
            abort_unless($departmentId, 422, 'Jurusan akun belum ditentukan.');
            $request->merge(['department_id' => $departmentId, 'departmentId' => $departmentId]);
        }
    }

    /**
     * Pastikan semua id pada tabel (students/courses/cpls) milik prodi admin yang login.
     */
    protected function ensureIdsInDepartment(Request $request, string $table, iterable $ids): void
    {
        if (! $this->isDepartmentAdmin($request)) {
            return;
        }

        $ids = collect($ids)->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }

        $owned = \Illuminate\Support\Facades\DB::table($table)
            ->whereIn('id', $ids)
            ->where('department_id', $request->user()->department_id)
            ->count();

        abort_if($owned !== $ids->count(), 403, 'Sebagian data tidak berada pada jurusan Anda.');
    }

    /**
     * Prodi yang menjadi konteks kurikulum: prodi akun, atau departmentId pilihan Super Admin.
     */
    protected function curriculumDepartmentId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        return $user->role === 'super_admin'
            ? ($request->input('departmentId', $request->input('department_id')) ?: null)
            : $user->department_id;
    }

    /**
     * Kurikulum yang sedang dikelola: dari header X-Curriculum-Id (atau query curriculumId)
     * bila milik prodi tersebut, jika tidak ada memakai kurikulum aktif (default) prodi.
     */
    protected function currentCurriculum(Request $request, ?string $departmentId = null): ?Curriculum
    {
        $departmentId ??= $this->curriculumDepartmentId($request);
        if (! $departmentId) {
            return null;
        }

        $requested = $request->header('X-Curriculum-Id') ?: $request->query('curriculumId');
        if ($requested) {
            $curriculum = Curriculum::where('department_id', $departmentId)->find($requested);
            if ($curriculum) {
                return $curriculum;
            }
        }

        return Curriculum::where('department_id', $departmentId)
            ->orderByDesc('is_default')
            ->orderByDesc('created_at')
            ->first();
    }

    /**
     * Kurikulum yang berlaku untuk suatu angkatan; bila tidak ada yang cocok memakai $fallback.
     */
    protected function curriculumForCohort(?string $departmentId, $cohort, ?Curriculum $fallback = null): ?Curriculum
    {
        if ($departmentId && is_numeric($cohort)) {
            $match = Curriculum::where('department_id', $departmentId)
                ->where('status', 'Aktif')
                ->get()
                ->filter(fn (Curriculum $curriculum) => $curriculum->coversCohort((int) $cohort))
                ->sortByDesc(fn (Curriculum $curriculum) => $curriculum->cohort_from ?? 0)
                ->first();
            if ($match) {
                return $match;
            }
        }

        return $fallback;
    }

    protected function scopeToCurriculum($query, ?Curriculum $curriculum, string $column = 'curriculum_id')
    {
        if ($curriculum) {
            $query->where($column, $curriculum->id);
        }

        return $query;
    }
}
