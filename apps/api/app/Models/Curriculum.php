<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Curriculum extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'curricula';

    protected $fillable = ['department_id', 'code', 'name', 'cohort_from', 'cohort_to', 'status', 'is_default', 'notes'];

    protected $casts = [
        'is_default' => 'boolean',
        'cohort_from' => 'integer',
        'cohort_to' => 'integer',
    ];

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function courses()
    {
        return $this->hasMany(Course::class);
    }

    public function cpls()
    {
        return $this->hasMany(Cpl::class);
    }

    public function graduateProfiles()
    {
        return $this->hasMany(GraduateProfile::class);
    }

    public function coversCohort(int $cohort): bool
    {
        return ($this->cohort_from === null || $cohort >= $this->cohort_from)
            && ($this->cohort_to === null || $cohort <= $this->cohort_to);
    }
}
