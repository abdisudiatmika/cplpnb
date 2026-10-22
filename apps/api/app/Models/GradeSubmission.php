<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GradeSubmission extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['assessment_plan_id', 'status', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at', 'locked_by', 'locked_at', 'reopen_reason'];
    protected $casts = ['submitted_at' => 'datetime', 'approved_at' => 'datetime', 'locked_at' => 'datetime'];

    public function assessmentPlan() { return $this->belongsTo(AssessmentPlan::class); }
}
