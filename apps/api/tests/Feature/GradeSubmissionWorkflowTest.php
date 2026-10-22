<?php

namespace Tests\Feature;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Course;
use App\Models\CourseEnrollment;
use App\Models\CourseOffering;
use App\Models\Department;
use App\Models\Lecturer;
use App\Models\Student;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class GradeSubmissionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_complete_workflow_locks_scores_and_records_audit_trail(): void
    {
        $context = $this->context();

        $this->actingAs($context['lecturerUser'])
            ->postJson("/api/lecturer-gradebooks/{$context['memberAssignment']->id}/submit")
            ->assertUnprocessable();

        $this->saveCompleteScores($context, $context['memberAssignment']);

        $this->actingAs($context['lecturerUser'])
            ->postJson("/api/lecturer-gradebooks/{$context['memberAssignment']->id}/submit")
            ->assertOk()->assertJsonPath('submission.status', 'Submitted');

        $this->actingAs($context['lecturerUser'])
            ->putJson("/api/lecturer-gradebooks/{$context['memberAssignment']->id}/scores", ['scores' => [[
                'enrollmentId' => $context['enrollment']->id,
                'assessmentItemId' => $context['item1']->id,
                'score' => 75,
                'eligibilityStatus' => 'eligible',
            ]]])
            ->assertStatus(409);

        $this->actingAs($context['lecturerUser'])
            ->postJson("/api/lecturer-gradebooks/{$context['memberAssignment']->id}/approve")
            ->assertForbidden();

        $this->actingAs($context['coordinatorUser'])
            ->postJson("/api/lecturer-gradebooks/{$context['coordinatorAssignment']->id}/approve")
            ->assertOk()->assertJsonPath('submission.status', 'Approved');

        $this->actingAs($context['admin'])
            ->postJson("/api/lecturer-gradebooks/{$context['memberAssignment']->id}/lock")
            ->assertOk()->assertJsonPath('submission.status', 'Locked');

        $this->actingAs($context['admin'])
            ->postJson("/api/lecturer-gradebooks/{$context['memberAssignment']->id}/reopen", ['reason' => 'Perbaikan nilai berdasarkan berita acara.'])
            ->assertOk()->assertJsonPath('submission.status', 'Draft');

        foreach (['score_updated', 'submitted', 'approved', 'locked', 'reopened'] as $action) {
            $this->assertDatabaseHas('grade_audit_logs', ['assessment_plan_id' => $context['plan']->id, 'action' => $action]);
        }
    }

    public function test_gradebook_calculates_cpl_scores_from_cpmk_mappings(): void
    {
        $context = $this->context();
        $response = $this->saveCompleteScores($context, $context['memberAssignment']);

        $response->assertJsonPath('students.0.finalScore', 76)
            ->assertJsonPath('students.0.cpmkScores.' . $context['cpmk1']->id, 70)
            ->assertJsonPath('students.0.cpmkScores.' . $context['cpmk2']->id, 80)
            ->assertJsonPath('students.0.cplScores.CPL-1', 70)
            ->assertJsonPath('students.0.cplScores.CPL-2', 80);
    }

    private function saveCompleteScores(array $context, TeachingAssignment $assignment)
    {
        return $this->actingAs($context['lecturerUser'])->putJson("/api/lecturer-gradebooks/{$assignment->id}/scores", ['scores' => [
            ['enrollmentId' => $context['enrollment']->id, 'assessmentItemId' => $context['item1']->id, 'score' => 70, 'eligibilityStatus' => 'eligible'],
            ['enrollmentId' => $context['enrollment']->id, 'assessmentItemId' => $context['item2']->id, 'score' => 80, 'eligibilityStatus' => 'eligible'],
        ]])->assertOk();
    }

    private function context(): array
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $admin = $this->user('admin_jurusan', $department->id, 'admin-workflow@example.test', 'Admin');
        $lecturerUser = $this->user('dosen', $department->id, 'member-workflow@example.test', 'Dosen Anggota');
        $coordinatorUser = $this->user('dosen', $department->id, 'coordinator-workflow@example.test', 'Koordinator');
        $lecturer = Lecturer::create(['user_id' => $lecturerUser->id, 'department_id' => $department->id, 'employee_number' => 'NIP-W1', 'status' => 'Aktif']);
        $coordinator = Lecturer::create(['user_id' => $coordinatorUser->id, 'department_id' => $department->id, 'employee_number' => 'NIP-W2', 'status' => 'Aktif']);
        $course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'MKB-W', 'name' => 'Akuntansi Lanjut', 'sks' => 3, 'semester' => 1]);
        $cpmk1 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK01-01', 'description' => 'CPMK 1', 'status' => 'Aktif']);
        $cpmk2 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK02-01', 'description' => 'CPMK 2', 'status' => 'Aktif']);
        $cpl1 = Cpl::create(['department_id' => $department->id, 'code' => 'CPL-1', 'description' => 'CPL 1', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $cpl2 = Cpl::create(['department_id' => $department->id, 'code' => 'CPL-2', 'description' => 'CPL 2', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $cpmk1->cplMappings()->create(['cpl_id' => $cpl1->id, 'contribution_weight' => 100]);
        $cpmk2->cplMappings()->create(['cpl_id' => $cpl2->id, 'contribution_weight' => 100]);
        $period = AcademicPeriod::create(['department_id' => $department->id, 'academic_year' => '2025/2026', 'semester' => 'Ganjil', 'status' => 'Aktif']);
        $class = AcademicClass::create(['department_id' => $department->id, 'name' => 'A', 'cohort_year' => 2025, 'status' => 'Aktif']);
        $offering = CourseOffering::create(['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id, 'status' => 'Aktif']);
        $memberAssignment = TeachingAssignment::create(['course_offering_id' => $offering->id, 'lecturer_id' => $lecturer->id, 'role' => 'member', 'status' => 'Aktif', 'assigned_by' => $admin->id]);
        $coordinatorAssignment = TeachingAssignment::create(['course_offering_id' => $offering->id, 'lecturer_id' => $coordinator->id, 'role' => 'coordinator', 'status' => 'Aktif', 'assigned_by' => $admin->id]);
        $plan = AssessmentPlan::create(['course_offering_id' => $offering->id, 'version' => 1, 'status' => 'Published', 'published_by' => $admin->id, 'published_at' => now()]);
        $item1 = AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $cpmk1->id, 'category' => 'assignment', 'name' => 'Tugas', 'weight' => 40, 'sequence' => 1, 'is_required' => true]);
        $item2 = AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $cpmk2->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 60, 'sequence' => 2, 'is_required' => true]);
        $student = Student::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'nim' => '25099', 'name' => 'Mahasiswa Workflow', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif']);
        $enrollment = CourseEnrollment::create(['course_offering_id' => $offering->id, 'student_id' => $student->id, 'enrollment_status' => 'active']);

        return compact('admin', 'lecturerUser', 'coordinatorUser', 'memberAssignment', 'coordinatorAssignment', 'plan', 'item1', 'item2', 'cpmk1', 'cpmk2', 'enrollment');
    }

    private function user(string $role, string $departmentId, string $email, string $name): User
    {
        return User::create(['id' => (string) Str::uuid(), 'name' => $name, 'email' => $email, 'password' => Hash::make('password123'), 'role' => $role, 'department_id' => $departmentId]);
    }
}
