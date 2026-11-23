<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class StudentCpmkScore extends Model
{
    use HasUuids;

    protected $fillable = ['student_id', 'course_id', 'cpmk_id', 'score', 'semester', 'academic_year', 'input_by'];

    protected $casts = ['score' => 'float'];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function cpmk()
    {
        return $this->belongsTo(Cpmk::class);
    }
}
