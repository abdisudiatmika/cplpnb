<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AcademicPeriod extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['department_id', 'academic_year', 'semester', 'starts_at', 'ends_at', 'status'];
    protected $casts = ['starts_at' => 'date', 'ends_at' => 'date'];

    public function department() { return $this->belongsTo(Department::class); }
    public function offerings() { return $this->hasMany(CourseOffering::class); }
}
