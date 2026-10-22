<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AssessmentPlan extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_offering_id', 'version', 'status', 'published_by', 'published_at'];
    protected $casts = ['published_at' => 'datetime'];

    public function courseOffering() { return $this->belongsTo(CourseOffering::class); }
    public function items() { return $this->hasMany(AssessmentItem::class)->orderBy('sequence'); }
    public function publishedBy() { return $this->belongsTo(User::class, 'published_by'); }
}
