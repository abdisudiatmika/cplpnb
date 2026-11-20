<?php

namespace App\Http\Controllers;

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
}
