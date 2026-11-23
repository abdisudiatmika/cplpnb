<?php

use App\Services\CpmkWeightBalancer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Samakan bobot kontribusi CPMK per mata kuliah (100% dibagi rata ke CPMK aktif).
 * Sebelumnya sebagian bobot berasal dari skala lama 1/2/3 (rendah/sedang/tinggi) pemetaan MK-CPL.
 * Hanya mata kuliah yang memiliki CPMK aktif yang diproses. Tidak bisa dibalik (pakai backup DB).
 */
return new class extends Migration
{
    public function up(): void
    {
        $balancer = app(CpmkWeightBalancer::class);
        DB::table('cpmks')->where('status', 'Aktif')->distinct()->pluck('course_id')
            ->each(fn ($courseId) => $balancer->rebalance($courseId));
    }

    public function down(): void
    {
        // Bobot lama tidak disimpan; kembalikan dari backup database bila perlu.
    }
};
