<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GraduateProfileCpl extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'graduate_profile_cpl';
    protected $fillable = ['graduate_profile_id', 'cpl_id', 'contribution_type'];

    public function graduateProfile() { return $this->belongsTo(GraduateProfile::class); }
    public function cpl() { return $this->belongsTo(Cpl::class); }
}
