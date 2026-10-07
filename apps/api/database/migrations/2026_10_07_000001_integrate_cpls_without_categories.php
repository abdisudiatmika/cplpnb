<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $categoryOrder = [
            'Sikap' => 1,
            'Pengetahuan' => 2,
            'Keterampilan Umum' => 3,
            'Keterampilan Khusus' => 4,
        ];

        $cpls = DB::table('cpls')->get()->groupBy('department_id');

        foreach ($cpls as $departmentCpls) {
            $ordered = $departmentCpls->sort(function ($left, $right) use ($categoryOrder) {
                $leftCategory = $categoryOrder[$left->category] ?? 99;
                $rightCategory = $categoryOrder[$right->category] ?? 99;

                if ($leftCategory !== $rightCategory) {
                    return $leftCategory <=> $rightCategory;
                }

                return strnatcasecmp($left->code, $right->code);
            })->values();

            foreach ($ordered as $index => $cpl) {
                DB::table('cpls')->where('id', $cpl->id)->update([
                    'code' => 'CPL-' . ($index + 1),
                ]);
            }
        }

        Schema::table('cpls', function (Blueprint $table) {
            $table->dropColumn('category');
            $table->unique(['department_id', 'code'], 'cpls_department_code_unique');
        });
    }

    public function down(): void
    {
        Schema::table('cpls', function (Blueprint $table) {
            $table->dropUnique('cpls_department_code_unique');
            $table->enum('category', [
                'Sikap',
                'Pengetahuan',
                'Keterampilan Umum',
                'Keterampilan Khusus',
            ])->nullable()->after('description');
        });
    }
};
