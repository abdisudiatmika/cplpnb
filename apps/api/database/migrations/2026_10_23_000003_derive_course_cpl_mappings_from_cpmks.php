<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cpmks') || ! Schema::hasTable('cpmk_cpl_mappings') || ! Schema::hasTable('course_cpl_mappings')) {
            return;
        }

        DB::transaction(function () {
            $courseIds = DB::table('cpmks')->distinct()->pluck('course_id');

            if ($courseIds->isEmpty()) {
                return;
            }

            DB::table('course_cpl_mappings')->whereIn('course_id', $courseIds)->delete();

            $now = now();
            $derivedMappings = DB::table('cpmk_cpl_mappings')
                ->join('cpmks', 'cpmk_cpl_mappings.cpmk_id', '=', 'cpmks.id')
                ->where('cpmks.status', 'Aktif')
                ->groupBy('cpmks.course_id', 'cpmk_cpl_mappings.cpl_id')
                ->selectRaw('cpmks.course_id, cpmk_cpl_mappings.cpl_id, SUM(cpmk_cpl_mappings.contribution_weight) AS weight')
                ->get()
                ->map(fn ($mapping) => [
                    'id' => (string) Str::uuid(),
                    'course_id' => $mapping->course_id,
                    'cpl_id' => $mapping->cpl_id,
                    'weight' => (float) $mapping->weight,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
                ->all();

            if ($derivedMappings !== []) {
                DB::table('course_cpl_mappings')->insert($derivedMappings);
            }
        });
    }

    public function down(): void
    {
        // This table is a compatibility cache derived from CPMK data.
    }
};
