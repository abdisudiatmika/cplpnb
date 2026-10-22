<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GradeAuditLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['assessment_plan_id', 'score_id', 'old_score', 'new_score', 'action', 'reason', 'user_id'];
    protected $casts = ['old_score' => 'float', 'new_score' => 'float'];
}
