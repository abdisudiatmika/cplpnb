<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TeachingAssignment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_offering_id', 'lecturer_id', 'role', 'status', 'assigned_by'];

    public function courseOffering() { return $this->belongsTo(CourseOffering::class); }
    public function lecturer() { return $this->belongsTo(Lecturer::class); }
    public function assignedBy() { return $this->belongsTo(User::class, 'assigned_by'); }
}
