<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Cpl extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['code', 'description', 'category', 'target_value', 'department_id'];

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function courseMappings()
    {
        return $this->hasMany(CourseCplMapping::class);
    }
}
