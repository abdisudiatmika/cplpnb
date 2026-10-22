<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseOffering extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_id', 'academic_class_id', 'academic_period_id', 'status'];

    public function course() { return $this->belongsTo(Course::class); }
    public function academicClass() { return $this->belongsTo(AcademicClass::class); }
    public function academicPeriod() { return $this->belongsTo(AcademicPeriod::class); }
    public function teachingAssignments() { return $this->hasMany(TeachingAssignment::class); }
    public function assessmentPlans() { return $this->hasMany(AssessmentPlan::class); }
    public function enrollments() { return $this->hasMany(CourseEnrollment::class); }
}
