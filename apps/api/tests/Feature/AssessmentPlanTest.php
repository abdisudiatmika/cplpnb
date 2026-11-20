<?php

namespace Tests\Feature;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\Course;
use App\Models\CourseOffering;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\Lecturer;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AssessmentPlanTest extends TestCase
{
    use RefreshDatabase;

    public function test_draft_can_be_saved_but_publish_requires_exactly_one_hundred_percent_and_all_cpmks(): void
    {
        $context = $this->context();
        $admin = $context['admin'];

        $response = $this->actingAs($admin)->postJson('/api/assessment-plans', [
            'courseOfferingId' => $context['offering']->id,
            'items' => [[
                'cpmkId' => $context['cpmk1']->id,
                'category' => 'assignment',
                'name' => 'Tugas 1',
                'weight' => 40,
                'sequence' => 1,
            ]],
        ])->assertCreated()->assertJsonPath('status', 'Draft')->assertJsonPath('totalWeight', 40);

        $planId = $response->json('id');
        $this->actingAs($admin)->postJson("/api/assessment-plans/{$planId}/publish")
            ->assertUnprocessable()->assertJsonValidationErrors('items');

        $this->actingAs($admin)->putJson("/api/assessment-plans/{$planId}", ['items' => [[
            'cpmkId' => $context['cpmk1']->id,
            'category' => 'midterm',
            'name' => 'UTS',
            'weight' => 100,
            'sequence' => 1,
        ]]])->assertOk();

        $this->actingAs($admin)->postJson("/api/assessment-plans/{$planId}/publish")
            ->assertUnprocessable()->assertJsonValidationErrors('items');

        $items = [
            ['cpmkId' => $context['cpmk1']->id, 'category' => 'assignment', 'name' => 'Tugas 1', 'weight' => 40, 'sequence' => 1],
            ['cpmkId' => $context['cpmk2']->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 60, 'sequence' => 2],
        ];
        $this->actingAs($admin)->putJson("/api/assessment-plans/{$planId}", ['items' => $items])->assertOk();
        $this->actingAs($admin)->postJson("/api/assessment-plans/{$planId}/publish")
            ->assertOk()->assertJsonPath('status', 'Published')->assertJsonPath('totalWeight', 100);
    }

    public function test_published_plan_cannot_be_edited_or_deleted(): void
    {
        $context = $this->context();
        $plan = $this->createPublishedPlan($context);

        $this->actingAs($context['admin'])->putJson('/api/assessment-plans/'.$plan['id'], ['items' => []])->assertUnprocessable();
        $this->actingAs($context['admin'])->deleteJson('/api/assessment-plans/'.$plan['id'])->assertUnprocessable();
    }

    public function test_assessment_item_rejects_cpmk_from_another_course(): void
    {
        $context = $this->context();
        $otherCourse = Course::create([
            'id' => (string) Str::uuid(), 'department_id' => $context['department']->id,
            'code' => 'OTHER', 'name' => 'Other', 'sks' => 2, 'semester' => 1,
        ]);
        $foreignCpmk = Cpmk::create([
            'course_id' => $otherCourse->id, 'code' => 'CPMK01-01',
            'description' => 'CPMK mata kuliah lain', 'status' => 'Aktif',
        ]);

        $this->actingAs($context['admin'])->postJson('/api/assessment-plans', [
            'courseOfferingId' => $context['offering']->id,
            'items' => [[
                'cpmkId' => $foreignCpmk->id, 'category' => 'quiz', 'name' => 'Kuis', 'weight' => 100, 'sequence' => 1,
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors('items');
    }

    public function test_lecturer_only_reads_published_plan_for_assigned_offering(): void
    {
        $context = $this->context();
        $this->actingAs($context['admin'])->postJson('/api/assessment-plans', [
            'courseOfferingId' => $context['offering']->id,
            'items' => [],
        ])->assertCreated();

        $this->actingAs($context['lecturerUser'])->getJson('/api/assessment-plans')->assertOk()->assertJsonCount(0);
        $this->createPublishedPlan($context, false);
        $this->actingAs($context['lecturerUser'])->getJson('/api/assessment-plans')
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.status', 'Published');
    }

    private function createPublishedPlan(array $context, bool $create = true): array
    {
        if ($create) {
            $response = $this->actingAs($context['admin'])->postJson('/api/assessment-plans', [
                'courseOfferingId' => $context['offering']->id,
                'items' => [
                    ['cpmkId' => $context['cpmk1']->id, 'category' => 'assignment', 'name' => 'Tugas', 'weight' => 40, 'sequence' => 1],
                    ['cpmkId' => $context['cpmk2']->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 60, 'sequence' => 2],
                ],
            ])->assertCreated();
        } else {
            $draft = \App\Models\AssessmentPlan::where('course_offering_id', $context['offering']->id)->where('status', 'Draft')->firstOrFail();
            $this->actingAs($context['admin'])->putJson('/api/assessment-plans/'.$draft->id, ['items' => [
                ['cpmkId' => $context['cpmk1']->id, 'category' => 'assignment', 'name' => 'Tugas', 'weight' => 40, 'sequence' => 1],
                ['cpmkId' => $context['cpmk2']->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 60, 'sequence' => 2],
            ]])->assertOk();
            $response = ['id' => $draft->id];
        }

        $id = is_array($response) ? $response['id'] : $response->json('id');
        $this->actingAs($context['admin'])->postJson('/api/assessment-plans/'.$id.'/publish')->assertOk();

        return ['id' => $id];
    }

    private function context(): array
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $admin = $this->user('admin_jurusan', $department->id, 'admin@example.test', 'Admin');
        $lecturerUser = $this->user('dosen', $department->id, 'dosen@example.test', 'Dosen');
        $lecturer = Lecturer::create(['user_id' => $lecturerUser->id, 'department_id' => $department->id, 'employee_number' => 'NIP-1', 'status' => 'Aktif']);
        $course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'MKB-1', 'name' => 'Akuntansi', 'sks' => 3, 'semester' => 1]);
        $cpl1 = Cpl::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'CPL-1', 'description' => 'CPL 1', 'target_value' => 75]);
        $cpl2 = Cpl::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'CPL-2', 'description' => 'CPL 2', 'target_value' => 75]);
        $cpmk1 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK01-01', 'description' => 'CPMK 1', 'status' => 'Aktif']);
        $cpmk2 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK02-01', 'description' => 'CPMK 2', 'status' => 'Aktif']);
        \App\Models\CpmkCplMapping::create(['cpmk_id' => $cpmk1->id, 'cpl_id' => $cpl1->id, 'contribution_weight' => 100]);
        \App\Models\CpmkCplMapping::create(['cpmk_id' => $cpmk2->id, 'cpl_id' => $cpl2->id, 'contribution_weight' => 100]);
        $period = AcademicPeriod::create(['department_id' => $department->id, 'academic_year' => '2025/2026', 'semester' => 'Ganjil', 'status' => 'Aktif']);
        $class = AcademicClass::create(['department_id' => $department->id, 'name' => 'A', 'cohort_year' => 2025, 'status' => 'Aktif']);
        $offering = CourseOffering::create(['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id, 'status' => 'Aktif']);
        TeachingAssignment::create(['course_offering_id' => $offering->id, 'lecturer_id' => $lecturer->id, 'role' => 'member', 'status' => 'Aktif', 'assigned_by' => $admin->id]);

        return compact('department', 'admin', 'lecturerUser', 'lecturer', 'course', 'cpmk1', 'cpmk2', 'offering');
    }

    private function user(string $role, string $departmentId, string $email, string $name): User
    {
        return User::create(['id' => (string) Str::uuid(), 'name' => $name, 'email' => $email, 'password' => Hash::make('password123'), 'role' => $role, 'department_id' => $departmentId]);
    }
}
