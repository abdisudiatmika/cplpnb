<?php

namespace Tests\Feature;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Course;
use App\Models\CourseOffering;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\Lecturer;
use App\Models\Student;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class LecturerGradebookTest extends TestCase
{
    use RefreshDatabase;

    public function test_lecturer_class_list_includes_grade_progress_summary(): void
    {
        $context = $this->context();
        Student::create(['id' => (string) Str::uuid(), 'department_id' => $context['department']->id, 'nim' => '25000', 'name' => 'Mahasiswa Ringkas', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif']);
        $this->actingAs($context['admin'])->postJson('/api/teaching-assignments/'.$context['assignment']->id.'/sync-enrollments')->assertOk();

        $this->actingAs($context['lecturerUser'])->getJson('/api/lecturer-gradebooks')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.gradeStatus', 'Draft')
            ->assertJsonPath('0.studentCount', 1)
            ->assertJsonPath('0.completedStudents', 0)
            ->assertJsonPath('0.assessmentItemCount', 2);
    }

    public function test_lecturer_can_save_cpmk_analysis_while_gradebook_is_draft(): void
    {
        $context = $this->context();

        $this->actingAs($context['lecturerUser'])
            ->putJson('/api/lecturer-gradebooks/'.$context['assignment']->id.'/analysis', [
                'analysis' => 'Mayoritas mahasiswa telah mencapai CPMK dan perlu penguatan pada latihan analitis.',
            ])
            ->assertOk()
            ->assertJsonPath('submission.cpmkAnalysis', 'Mayoritas mahasiswa telah mencapai CPMK dan perlu penguatan pada latihan analitis.');

        $this->assertDatabaseHas('grade_submissions', [
            'assessment_plan_id' => $context['assignment']->courseOffering->assessmentPlans()->first()->id,
            'cpmk_analysis' => 'Mayoritas mahasiswa telah mencapai CPMK dan perlu penguatan pada latihan analitis.',
        ]);
    }

    public function test_admin_syncs_matching_students_and_lecturer_saves_zero_as_real_score(): void
    {
        $context = $this->context();
        Student::create(['id' => (string) Str::uuid(), 'department_id' => $context['department']->id, 'nim' => '25001', 'name' => 'Mahasiswa A', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif']);
        Student::create(['id' => (string) Str::uuid(), 'department_id' => $context['department']->id, 'nim' => '25002', 'name' => 'Mahasiswa B', 'angkatan' => '2025', 'kelas' => 'B', 'status' => 'Aktif']);

        $this->actingAs($context['admin'])->postJson('/api/teaching-assignments/'.$context['assignment']->id.'/sync-enrollments')
            ->assertOk()->assertJsonPath('matchedStudents', 1)->assertJsonPath('enrollments', 1);

        $gradebook = $this->actingAs($context['lecturerUser'])->getJson('/api/lecturer-gradebooks/'.$context['assignment']->id)
            ->assertOk()->assertJsonCount(1, 'students');
        $enrollmentId = $gradebook->json('students.0.enrollmentId');

        $response = $this->actingAs($context['lecturerUser'])->putJson('/api/lecturer-gradebooks/'.$context['assignment']->id.'/scores', ['scores' => [
            ['enrollmentId' => $enrollmentId, 'assessmentItemId' => $context['item1']->id, 'score' => 0, 'eligibilityStatus' => 'eligible'],
            ['enrollmentId' => $enrollmentId, 'assessmentItemId' => $context['item2']->id, 'score' => 80, 'eligibilityStatus' => 'eligible'],
        ]]);

        $response->assertOk()
            ->assertJsonPath('students.0.isComplete', true)
            ->assertJsonPath('students.0.finalScore', 48)
            ->assertJsonPath('students.0.scores.'.$context['item1']->id.'.score', 0);
        $this->assertDatabaseHas('student_assessment_scores', ['assessment_item_id' => $context['item1']->id, 'score' => 0]);
    }

    public function test_null_score_remains_incomplete_and_is_not_converted_to_zero(): void
    {
        $context = $this->context();
        $student = Student::create(['id' => (string) Str::uuid(), 'department_id' => $context['department']->id, 'nim' => '25003', 'name' => 'Mahasiswa C', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif']);
        $this->actingAs($context['admin'])->postJson('/api/teaching-assignments/'.$context['assignment']->id.'/sync-enrollments')->assertOk();
        $enrollmentId = \App\Models\CourseEnrollment::where('student_id', $student->id)->value('id');

        $this->actingAs($context['lecturerUser'])->putJson('/api/lecturer-gradebooks/'.$context['assignment']->id.'/scores', ['scores' => [
            ['enrollmentId' => $enrollmentId, 'assessmentItemId' => $context['item1']->id, 'score' => null, 'eligibilityStatus' => 'eligible'],
            ['enrollmentId' => $enrollmentId, 'assessmentItemId' => $context['item2']->id, 'score' => 80, 'eligibilityStatus' => 'eligible'],
        ]])->assertOk()->assertJsonPath('students.0.isComplete', false)->assertJsonPath('students.0.finalScore', null);

        $this->assertDatabaseHas('student_assessment_scores', ['assessment_item_id' => $context['item1']->id, 'score' => null]);
    }

    public function test_unassigned_lecturer_cannot_open_or_change_gradebook(): void
    {
        $context = $this->context();
        $otherUser = $this->user('dosen', $context['department']->id, 'other@example.test', 'Dosen Lain');
        Lecturer::create(['user_id' => $otherUser->id, 'department_id' => $context['department']->id, 'employee_number' => 'NIP-2', 'status' => 'Aktif']);

        $this->actingAs($otherUser)->getJson('/api/lecturer-gradebooks/'.$context['assignment']->id)->assertForbidden();
        $this->actingAs($otherUser)->putJson('/api/lecturer-gradebooks/'.$context['assignment']->id.'/scores', ['scores' => []])->assertForbidden();
    }

    public function test_lecturer_can_view_but_not_change_gradebook_of_archived_period(): void
    {
        $context = $this->context();
        $id = $context['assignment']->id;
        AcademicPeriod::query()->update(['status' => 'Selesai']);

        $this->actingAs($context['lecturerUser'])->getJson('/api/lecturer-gradebooks')
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.periodArchived', true);
        $this->actingAs($context['lecturerUser'])->getJson('/api/lecturer-gradebooks/'.$id)
            ->assertOk()->assertJsonPath('assignment.periodArchived', true);

        $this->actingAs($context['lecturerUser'])->putJson('/api/lecturer-gradebooks/'.$id.'/scores', ['scores' => []])->assertForbidden();
        $this->actingAs($context['lecturerUser'])->putJson('/api/lecturer-gradebooks/'.$id.'/analysis', ['analysis' => 'x'])->assertForbidden();
        $this->actingAs($context['lecturerUser'])->postJson('/api/lecturer-gradebooks/'.$id.'/submit')->assertForbidden();

        // Penugasan yang dinonaktifkan admin tetap tertutup sama sekali.
        $context['assignment']->update(['status' => 'Nonaktif']);
        $this->actingAs($context['lecturerUser'])->getJson('/api/lecturer-gradebooks')->assertOk()->assertJsonCount(0);
        $this->actingAs($context['lecturerUser'])->getJson('/api/lecturer-gradebooks/'.$id)->assertForbidden();
    }

    private function context(): array
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $admin = $this->user('admin_jurusan', $department->id, 'admin@example.test', 'Admin');
        $lecturerUser = $this->user('dosen', $department->id, 'dosen@example.test', 'Dosen');
        $lecturer = Lecturer::create(['user_id' => $lecturerUser->id, 'department_id' => $department->id, 'employee_number' => 'NIP-1', 'status' => 'Aktif']);
        $course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'MKB-1', 'name' => 'Akuntansi', 'sks' => 3, 'semester' => 1]);
        $cpmk1 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK01-01', 'description' => 'CPMK 1', 'status' => 'Aktif']);
        $cpmk2 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK02-01', 'description' => 'CPMK 2', 'status' => 'Aktif']);
        $period = AcademicPeriod::create(['department_id' => $department->id, 'academic_year' => '2025/2026', 'semester' => 'Ganjil', 'status' => 'Aktif']);
        $class = AcademicClass::create(['department_id' => $department->id, 'name' => 'A', 'cohort_year' => 2025, 'status' => 'Aktif']);
        $offering = CourseOffering::create(['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id, 'status' => 'Aktif']);
        $assignment = TeachingAssignment::create(['course_offering_id' => $offering->id, 'lecturer_id' => $lecturer->id, 'role' => 'member', 'status' => 'Aktif', 'assigned_by' => $admin->id]);
        $plan = AssessmentPlan::create(['course_offering_id' => $offering->id, 'version' => 1, 'status' => 'Published', 'published_by' => $admin->id, 'published_at' => now()]);
        $item1 = AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $cpmk1->id, 'category' => 'assignment', 'name' => 'Tugas', 'weight' => 40, 'sequence' => 1, 'is_required' => true]);
        $item2 = AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $cpmk2->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 60, 'sequence' => 2, 'is_required' => true]);

        return compact('department', 'admin', 'lecturerUser', 'assignment', 'item1', 'item2');
    }

    private function user(string $role, string $departmentId, string $email, string $name): User
    {
        return User::create(['id' => (string) Str::uuid(), 'name' => $name, 'email' => $email, 'password' => Hash::make('password123'), 'role' => $role, 'department_id' => $departmentId]);
    }
}
