<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AssessmentItem extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['assessment_plan_id', 'cpmk_id', 'category', 'name', 'weight', 'sequence', 'is_required'];
    protected $casts = ['weight' => 'float', 'is_required' => 'boolean'];

    public function assessmentPlan() { return $this->belongsTo(AssessmentPlan::class); }
    public function cpmk() { return $this->belongsTo(Cpmk::class); }
    public function scores() { return $this->hasMany(StudentAssessmentScore::class); }
}
