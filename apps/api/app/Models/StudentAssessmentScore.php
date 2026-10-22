<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentAssessmentScore extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_enrollment_id', 'assessment_item_id', 'score', 'eligibility_status', 'note', 'entered_by', 'entered_at', 'updated_by'];
    protected $casts = ['score' => 'float', 'entered_at' => 'datetime'];

    public function courseEnrollment() { return $this->belongsTo(CourseEnrollment::class); }
    public function assessmentItem() { return $this->belongsTo(AssessmentItem::class); }
}
