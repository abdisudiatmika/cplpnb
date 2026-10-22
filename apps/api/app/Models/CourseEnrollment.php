<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseEnrollment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_offering_id', 'student_id', 'enrollment_status'];

    public function courseOffering() { return $this->belongsTo(CourseOffering::class); }
    public function student() { return $this->belongsTo(Student::class); }
    public function scores() { return $this->hasMany(StudentAssessmentScore::class); }
}
