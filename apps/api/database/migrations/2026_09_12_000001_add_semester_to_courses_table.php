<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->unsignedTinyInteger('semester')->nullable()->after('sks');
        });

        $courseSemesters = [
            'MPK2462401101' => 1,
            'MKK2462401102' => 1,
            'MPK2462401103' => 1,
            'MKK2462401104' => 1,
            'MKK2462401105' => 1,
            'MKB2462401106' => 1,
            'MKK2462401107' => 1,
            'MKK2462401108' => 1,
            'MPK2462401109' => 1,
            'MPK2462401210' => 2,
            'MKK2462401211' => 2,
            'MKB2462401212' => 2,
            'MKB2462401213' => 2,
            'MKB2462401214' => 2,
            'MKK2462401215' => 2,
            'MKB2462401216' => 2,
            'MBB2462401217' => 2,
            'MKB2462401218' => 2,
            'MKB2462401319' => 3,
            'MKB2462401320' => 3,
            'MKK2462401321' => 3,
            'MKK2462401322' => 3,
            'MKB2462401323' => 3,
            'MKB2462401324' => 3,
            'MKB2462401325' => 3,
            'MKB2462401326' => 3,
            'MKB2462401327' => 3,
            'MKB2462401428' => 4,
            'MKB2462401429' => 4,
            'MKB2462401430' => 4,
            'MKK2462401431' => 4,
            'MKB2462401432' => 4,
            'MKB2462401433' => 4,
            'MKK2462401434' => 4,
            'MKK2462401435' => 4,
            'MPB2462401436' => 4,
            'MKB2462401537' => 5,
            'MKB2462401638' => 6,
            'MKB2462401639' => 6,
        ];

        foreach ($courseSemesters as $code => $semester) {
            DB::table('courses')->where('code', $code)->update(['semester' => $semester]);
            $courseIds = DB::table('courses')->where('code', $code)->pluck('id');
            DB::table('student_grades')->whereIn('course_id', $courseIds)->update(['semester' => (string) $semester]);
        }
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->dropColumn('semester');
        });
    }
};
