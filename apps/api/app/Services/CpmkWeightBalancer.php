<?php

namespace App\Services;

use App\Models\CourseCplMapping;
use App\Models\Cpmk;
use App\Models\CpmkCplMapping;

/**
 * Bobot kontribusi CPMK dibagi rata per mata kuliah: total CPMK aktif satu mata kuliah = 100%.
 * Contoh: 4 CPMK -> masing-masing 25%; 3 CPMK -> 33,33% / 33,33% / 33,34%.
 * Bila satu CPMK dipetakan ke lebih dari satu CPL, bagiannya dibagi rata lagi ke CPL tersebut.
 * Setelah itu pemetaan MK-CPL diturunkan ulang (bobot = jumlah bobot CPMK per CPL).
 * CPMK nonaktif tidak ikut dibagi dan tidak dihitung pada pemetaan MK-CPL.
 */
class CpmkWeightBalancer
{
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
            $mappings = $cpmks[$index]->cplMappings->sortBy('cpl_id')->values();
            foreach ($this->equalShares($mappings->count(), $share) as $mappingIndex => $weight) {
                $mapping = $mappings[$mappingIndex];
                if ((float) $mapping->contribution_weight !== $weight) {
                    $mapping->update(['contribution_weight' => $weight]);
                }
            }
        }

        $this->syncCourseMappings($courseId);
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

    private function syncCourseMappings(string $courseId): void
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
            CourseCplMapping::create([
                'course_id' => $courseId,
                'cpl_id' => $mapping->cpl_id,
                'weight' => round((float) $mapping->weight, 2),
            ]);
        }
    }
}
