<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Mencegah penghapusan data master yang sudah dipakai. Penghapusan di database bersifat
 * cascade, jadi menghapus prodi/MK/mahasiswa/dosen/CPL yang sudah punya nilai akan
 * ikut menghapus nilai tersebut tanpa bisa dikembalikan.
 */
class DeletionGuard
{
    /**
     * Hentikan request dengan 409 bila ada data yang masih bergantung.
     *
     * @param  array<string, int>  $usage  label => jumlah
     */
    public function abortIfUsed(string $subject, array $usage, string $advice): void
    {
        $parts = collect($usage)
            ->filter(fn ($count) => $count > 0)
            ->map(fn ($count, $label) => $count.' '.$label)
            ->values();

        if ($parts->isNotEmpty()) {
            abort(response()->json([
                'message' => $subject.' tidak dapat dihapus karena masih memiliki '.$parts->implode(', ').'. '.$advice,
                'usage' => collect($usage)->filter(fn ($count) => $count > 0),
            ], 409));
        }
    }

    /** @return array<string, int> */
    public function departmentUsage(string $departmentId): array
    {
        return [
            'mahasiswa' => DB::table('students')->where('department_id', $departmentId)->count(),
            'mata kuliah' => DB::table('courses')->where('department_id', $departmentId)->count(),
            'CPL' => DB::table('cpls')->where('department_id', $departmentId)->count(),
            'profil lulusan' => DB::table('graduate_profiles')->where('department_id', $departmentId)->count(),
            'dosen' => DB::table('lecturers')->where('department_id', $departmentId)->count(),
            'akun admin prodi' => DB::table('users')->where('department_id', $departmentId)->where('role', 'admin_jurusan')->count(),
        ];
    }

    /**
     * @param  iterable<string>  $courseIds
     * @return Collection<string, array<string, int>> course_id => label => jumlah
     */
    public function courseUsage(iterable $courseIds): Collection
    {
        $ids = collect($courseIds)->values();

        $legacy = DB::table('student_grades')->whereIn('course_id', $ids)
            ->groupBy('course_id')->selectRaw('course_id, COUNT(*) as total')->pluck('total', 'course_id');
        $obe = DB::table('student_assessment_scores')
            ->join('course_enrollments', 'student_assessment_scores.course_enrollment_id', '=', 'course_enrollments.id')
            ->join('course_offerings', 'course_enrollments.course_offering_id', '=', 'course_offerings.id')
            ->whereIn('course_offerings.course_id', $ids)
            ->groupBy('course_offerings.course_id')
            ->selectRaw('course_offerings.course_id as course_id, COUNT(*) as total')->pluck('total', 'course_id');
        $assignments = DB::table('teaching_assignments')
            ->join('course_offerings', 'teaching_assignments.course_offering_id', '=', 'course_offerings.id')
            ->whereIn('course_offerings.course_id', $ids)
            ->groupBy('course_offerings.course_id')
            ->selectRaw('course_offerings.course_id as course_id, COUNT(*) as total')->pluck('total', 'course_id');

        return $ids->mapWithKeys(fn ($id) => [$id => [
            'nilai lama' => (int) ($legacy[$id] ?? 0),
            'nilai komponen OBE' => (int) ($obe[$id] ?? 0),
            'penugasan dosen' => (int) ($assignments[$id] ?? 0),
        ]]);
    }

    /**
     * @param  iterable<string>  $studentIds
     * @return Collection<string, array<string, int>> student_id => label => jumlah
     */
    public function studentUsage(iterable $studentIds): Collection
    {
        $ids = collect($studentIds)->values();

        $legacy = DB::table('student_grades')->whereIn('student_id', $ids)
            ->groupBy('student_id')->selectRaw('student_id, COUNT(*) as total')->pluck('total', 'student_id');
        $obe = DB::table('student_assessment_scores')
            ->join('course_enrollments', 'student_assessment_scores.course_enrollment_id', '=', 'course_enrollments.id')
            ->whereIn('course_enrollments.student_id', $ids)
            ->groupBy('course_enrollments.student_id')
            ->selectRaw('course_enrollments.student_id as student_id, COUNT(*) as total')->pluck('total', 'student_id');

        return $ids->mapWithKeys(fn ($id) => [$id => [
            'nilai lama' => (int) ($legacy[$id] ?? 0),
            'nilai komponen OBE' => (int) ($obe[$id] ?? 0),
        ]]);
    }

    /** @return array<string, int> */
    public function lecturerUsage(string $lecturerId): array
    {
        return [
            'penugasan mengajar' => DB::table('teaching_assignments')->where('lecturer_id', $lecturerId)->count(),
        ];
    }

    /** @return array<string, int> */
    public function cplUsage(string $cplId): array
    {
        return [
            'pemetaan CPMK' => DB::table('cpmk_cpl_mappings')->where('cpl_id', $cplId)->count(),
            'pemetaan mata kuliah' => DB::table('course_cpl_mappings')->where('cpl_id', $cplId)->count(),
        ];
    }

    /**
     * Untuk hapus massal: tolak seluruh permintaan bila ada data yang sudah dipakai.
     *
     * @param  Collection<string, array<string, int>>  $usageById
     * @param  Collection<string, string>  $labelsById  id => kode/nama untuk pesan
     */
    public function abortIfAnyUsed(string $noun, Collection $usageById, Collection $labelsById, string $advice): void
    {
        $used = $usageById->filter(fn ($usage) => array_sum($usage) > 0);
        if ($used->isEmpty()) {
            return;
        }

        $names = $used->keys()->map(fn ($id) => $labelsById[$id] ?? $id);
        $shown = $names->take(10)->implode(', ').($names->count() > 10 ? ', dan '.($names->count() - 10).' lainnya' : '');

        abort(response()->json([
            'message' => 'Tidak ada '.$noun.' yang dihapus. '.$used->count().' '.$noun.' sudah memiliki nilai atau penugasan: '.$shown.'. '.$advice,
            'blockedIds' => $used->keys()->values(),
        ], 409));
    }
}
