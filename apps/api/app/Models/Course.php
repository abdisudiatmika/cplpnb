<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Course extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['code', 'name', 'sks', 'department_id'];

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function cplMappings()
    {
        return $this->hasMany(CourseCplMapping::class);
    }

    public function grades()
    {
        return $this->hasMany(StudentGrade::class);
    }
}
