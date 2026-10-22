<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AcademicClass extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['department_id', 'name', 'cohort_year', 'status'];

    public function department() { return $this->belongsTo(Department::class); }
    public function offerings() { return $this->hasMany(CourseOffering::class); }
}
