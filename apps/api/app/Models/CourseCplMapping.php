<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseCplMapping extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['course_id', 'cpl_id', 'weight'];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function cpl()
    {
        return $this->belongsTo(Cpl::class);
    }
}
