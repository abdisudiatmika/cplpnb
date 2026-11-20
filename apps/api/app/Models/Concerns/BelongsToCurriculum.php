<?php

namespace App\Models\Concerns;

use App\Models\Curriculum;

/**
 * Data master (MK, CPL, profil lulusan) yang dibuat tanpa curriculum_id otomatis
 * dimasukkan ke kurikulum aktif prodinya, agar tetap tampil pada daftar per kurikulum.
 */
trait BelongsToCurriculum
{
    protected static function bootBelongsToCurriculum(): void
    {
        static::creating(function ($model) {
            if (! $model->curriculum_id && $model->department_id) {
                $model->curriculum_id = Curriculum::where('department_id', $model->department_id)
                    ->orderByDesc('is_default')
                    ->orderByDesc('created_at')
                    ->value('id');
            }
        });
    }

    public function curriculum()
    {
        return $this->belongsTo(Curriculum::class);
    }
}
