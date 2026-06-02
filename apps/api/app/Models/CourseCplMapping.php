<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseCplMapping extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_id', 'cpl_id', 'weight'];

    protected $appends = [
        'courseId',
        'cplId',
        'courseCode',
        'courseName',
        'cplCode',
        'cplDescription',
        'cplCategory'
    ];

    public function getCourseIdAttribute()
    {
        return $this->attributes['course_id'] ?? null;
    }

    public function getCplIdAttribute()
    {
        return $this->attributes['cpl_id'] ?? null;
    }

    public function getCourseCodeAttribute()
    {
        return $this->course?->code;
    }

    public function getCourseNameAttribute()
    {
        return $this->course?->name;
    }

    public function getCplCodeAttribute()
    {
        return $this->cpl?->code;
    }

    public function getCplDescriptionAttribute()
    {
        return $this->cpl?->description;
    }

    public function getCplCategoryAttribute()
    {
        return $this->cpl?->category;
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function cpl()
    {
        return $this->belongsTo(Cpl::class);
    }
}
