<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Student extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['nim', 'name', 'angkatan', 'kelas', 'status', 'department_id'];

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function grades()
    {
        return $this->hasMany(StudentGrade::class);
    }
}
