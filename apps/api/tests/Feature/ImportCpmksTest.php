<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Curriculum;
use App\Models\Department;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ImportCpmksTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_from_document_file_creates_all_cpmks_and_derives_mappings(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        Curriculum::create(['department_id' => $department->id, 'code' => 'PTV', 'name' => 'Kurikulum PTV', 'is_default' => true]);
        foreach (range(1, 10) as $number) {
            Cpl::create(['code' => "CPL-{$number}", 'description' => "CPL {$number}", 'target_value' => 75, 'department_id' => $department->id]);
        }
        $file = base_path('database/data/cpmk/d3_akuntansi_smt1-2_2025-2026.json');
        $items = collect(json_decode(file_get_contents($file), true)['items']);
        foreach ($items->unique('courseCode') as $item) {
            Course::create(['code' => $item['courseCode'], 'name' => $item['courseName'], 'sks' => $item['sks'], 'department_id' => $department->id]);
        }
        // Pemetaan lama: SIA -> CPL-6 bobot 3 (akan dibagi ke dua CPMK), SIA -> CPL-9 (tidak ada di dokumen, akan hilang).
        $sia = Course::where('code', 'MKB2462401214')->first();
        CourseCplMapping::create(['course_id' => $sia->id, 'cpl_id' => Cpl::where('code', 'CPL-6')->value('id'), 'weight' => 3]);
        CourseCplMapping::create(['course_id' => $sia->id, 'cpl_id' => Cpl::where('code', 'CPL-9')->value('id'), 'weight' => 1]);

        $this->artisan('cpmk:impor', ['file' => $file])->assertSuccessful();
        $this->assertSame(0, Cpmk::count());

        $this->artisan('cpmk:impor', ['file' => $file, '--apply' => true])->assertSuccessful();
        $this->assertSame(62, Cpmk::count());
        $this->assertSame(62, Cpmk::whereHas('cplMappings')->count());

        $siaWeights = CourseCplMapping::with('cpl')->where('course_id', $sia->id)->get()->mapWithKeys(fn ($m) => [$m->cpl->code => (float) $m->weight])->all();
        // 3 CPMK aktif dibagi rata (33,33%): dua untuk CPL-6, satu untuk CPL-2; total 100%.
        $this->assertEqualsWithDelta(66.67, $siaWeights['CPL-6'], 0.02);
        $this->assertEqualsWithDelta(33.33, $siaWeights['CPL-2'], 0.02);
        $this->assertEqualsWithDelta(100, array_sum($siaWeights), 0.001);
        $this->assertArrayNotHasKey('CPL-9', $siaWeights);

        // Aman diulang.
        $this->artisan('cpmk:impor', ['file' => $file, '--apply' => true])->assertSuccessful();
        $this->assertSame(62, Cpmk::count());
    }

    public function test_missing_course_aborts_without_changes(): void
    {
        $department = Department::create(['name' => 'D3 Akuntansi', 'code' => 'AK']);
        Cpl::create(['code' => 'CPL-1', 'description' => 'x', 'target_value' => 75, 'department_id' => $department->id]);

        $this->artisan('cpmk:impor', ['file' => base_path('database/data/cpmk/d3_akuntansi_smt1-2_2025-2026.json'), '--apply' => true])->assertFailed();
        $this->assertSame(0, Cpmk::count());
    }
}
