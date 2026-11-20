<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GraduateProfile extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['department_id', 'code', 'name', 'english_name', 'summary', 'curriculum_version', 'status', 'sequence', 'curriculum_id'];

    public function curriculum() { return $this->belongsTo(Curriculum::class); }
    public function department() { return $this->belongsTo(Department::class); }
    public function cplMappings() { return $this->hasMany(GraduateProfileCpl::class); }
}
