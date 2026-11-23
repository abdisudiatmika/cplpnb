<?php

namespace App\Services;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpmk;
use App\Models\CpmkCplMapping;
use Illuminate\Validation\ValidationException;

/**
 * Bobot kontribusi CPMK per mata kuliah.
 *
 * Bobot diisi admin prodi (menu CPMK), boleh berbeda antar CPMK sesuai RPS, dengan syarat
 * total bobot CPMK aktif satu mata kuliah tidak melebihi 100%. CPMK nonaktif tidak dihitung.
 * Pemetaan MK-CPL selalu diturunkan dari bobot CPMK (bobot = jumlah bobot CPMK aktif per CPL).
 *
 * rebalance() (bagi rata) hanya dipakai migrasi 2026_11_23 dan impor CLI dengan --bagi-rata.
 */
class CpmkWeightBalancer
{
    public const MAX_TOTAL = 100.0;

    public function rebalance(string $courseId): void
    {
        $cpmks = Cpmk::with('cplMappings')
            ->where('course_id', $courseId)
            ->where('status', 'Aktif')
            ->orderBy('code')
            ->get()
            ->filter(fn (Cpmk $cpmk) => $cpmk->cplMappings->isNotEmpty())
            ->values();

        foreach ($this->equalShares($cpmks->count()) as $index => $share) {
            $this->setCpmkWeight($cpmks[$index], $share);
        }

        $this->syncCourseMappings($courseId);
    }

    /** Set bobot satu CPMK; bila dipetakan ke lebih dari satu CPL, bobotnya dibagi rata ke CPL tersebut. */
    public function setCpmkWeight(Cpmk $cpmk, float $weight): void
    {
        $mappings = $cpmk->cplMappings()->orderBy('cpl_id')->get();
        foreach ($this->equalShares($mappings->count(), $weight) as $index => $share) {
            if ((float) $mappings[$index]->contribution_weight !== $share) {
                $mappings[$index]->update(['contribution_weight' => $share]);
            }
        }
    }

    /**
     * Bagi sisa bobot (100% dikurangi CPMK aktif lain) secara rata ke CPMK yang belum diberi bobot.
     * Dipakai impor massal ketika file tidak mencantumkan bobot.
     *
     * @param  array<int, string>  $cpmkIds
     */
    public function fillRemaining(string $courseId, array $cpmkIds): void
    {
        $targets = Cpmk::where('course_id', $courseId)->where('status', 'Aktif')
            ->whereIn('id', $cpmkIds)->whereHas('cplMappings')->orderBy('code')->get();
        if ($targets->isEmpty()) {
            return;
        }
        $others = $this->activeTotal($courseId, $targets->pluck('id')->all());
        $remaining = max(0, round(self::MAX_TOTAL - $others, 2));
        foreach ($this->equalShares($targets->count(), $remaining) as $index => $share) {
            $this->setCpmkWeight($targets[$index], $share);
        }
    }

    /** Total bobot CPMK aktif pada satu mata kuliah. */
    public function activeTotal(string $courseId, array $exceptCpmkIds = []): float
    {
        return round((float) CpmkCplMapping::query()
            ->join('cpmks', 'cpmk_cpl_mappings.cpmk_id', '=', 'cpmks.id')
            ->where('cpmks.course_id', $courseId)
            ->where('cpmks.status', 'Aktif')
            ->when($exceptCpmkIds, fn ($query) => $query->whereNotIn('cpmks.id', $exceptCpmkIds))
            ->sum('cpmk_cpl_mappings.contribution_weight'), 2);
    }

    /**
     * Tolak bila total bobot CPMK aktif mata kuliah melebihi 100%. Panggil di dalam transaksi.
     * $totalBefore: total sebelum perubahan; data lama yang sudah di atas 100% tetap boleh diedit
     * selama perubahan tidak menambah totalnya.
     */
    public function assertWithinLimit(string $courseId, ?string $changedCpmkId = null, ?float $totalBefore = null): void
    {
        $total = $this->activeTotal($courseId);
        if ($total <= self::MAX_TOTAL + 0.001 || ($totalBefore !== null && $total <= $totalBefore + 0.001)) {
            return;
        }

        $course = Course::find($courseId);
        $label = $course ? $course->code.' - '.$course->name : 'mata kuliah ini';
        $message = 'Total bobot CPMK aktif '.$label.' menjadi '.$this->format($total).'%, melebihi 100%.';
        if ($changedCpmkId) {
            $available = max(0, self::MAX_TOTAL - $this->activeTotal($courseId, [$changedCpmkId]));
            $message .= ' Bobot maksimal untuk CPMK ini '.$this->format($available).'%. Kurangi dulu bobot CPMK lain bila perlu.';
        }

        throw ValidationException::withMessages(['contributionWeight' => [$message]]);
    }

    /**
     * Pecah $total menjadi $count bagian sama besar (2 desimal); sisa pembulatan masuk bagian terakhir.
     *
     * @return array<int, float>
     */
    public function equalShares(int $count, float $total = 100): array
    {
        if ($count <= 0) {
            return [];
        }
        $base = floor($total * 100 / $count) / 100;
        $shares = array_fill(0, $count, $base);
        $shares[$count - 1] = round($total - $base * ($count - 1), 2);

        return $shares;
    }

    public function syncCourseMappings(string $courseId): void
    {
        $derived = CpmkCplMapping::query()
            ->join('cpmks', 'cpmk_cpl_mappings.cpmk_id', '=', 'cpmks.id')
            ->where('cpmks.course_id', $courseId)
            ->where('cpmks.status', 'Aktif')
            ->groupBy('cpmk_cpl_mappings.cpl_id')
            ->selectRaw('cpmk_cpl_mappings.cpl_id, SUM(cpmk_cpl_mappings.contribution_weight) AS weight')
            ->get();

        CourseCplMapping::where('course_id', $courseId)->delete();
        foreach ($derived as $mapping) {
            if ((float) $mapping->weight <= 0) {
                continue;
            }
            CourseCplMapping::create([
                'course_id' => $courseId,
                'cpl_id' => $mapping->cpl_id,
                'weight' => round((float) $mapping->weight, 2),
            ]);
        }
    }

    private function format(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, ',', ''), '0'), ',');
    }
}
