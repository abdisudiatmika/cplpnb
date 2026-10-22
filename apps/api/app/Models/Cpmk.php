<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Cpmk extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'course_id',
        'code',
        'description',
        'curriculum_version',
        'status',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function cplMappings()
    {
        return $this->hasMany(CpmkCplMapping::class);
    }

    public function assessmentItems()
    {
        return $this->hasMany(AssessmentItem::class);
    }
}
