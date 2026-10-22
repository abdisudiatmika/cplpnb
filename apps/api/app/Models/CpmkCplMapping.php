<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CpmkCplMapping extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['cpmk_id', 'cpl_id', 'contribution_weight'];

    protected $casts = ['contribution_weight' => 'float'];

    public function cpmk()
    {
        return $this->belongsTo(Cpmk::class);
    }

    public function cpl()
    {
        return $this->belongsTo(Cpl::class);
    }
}
