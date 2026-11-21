<?php

namespace Tests\Feature;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Course;
use App\Models\CourseEnrollment;
use App\Models\CourseOffering;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\GradeSubmission;
use App\Models\Lecturer;
use App\Models\Student;
use App\Models\StudentAssessmentScore;
use App\Models\StudentGrade;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class ObeReportAndDeletionGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_course_reports_use_locked_obe_final_scores(): void
    {
        $c = $this->context();
        // Nilai lama untuk mahasiswa yang sama tidak boleh dihitung dua kali; nilai OBE diutamakan.
        StudentGrade::create(['student_id' => $c['student']->id, 'course_id' => $c['course']->id, 'grade' => 'D', 'score' => 50, 'semester' => '1', 'academic_year' => '2025/2026']);

        $summary = collect($this->actingAs($c['admin'])->getJson('/api/cpl/course-summary')->assertOk()->json())
            ->firstWhere('code', 'MKB-G');
        $this->assertEquals(74, $summary['average_grade']); // 80 x 40% + 70 x 60%
        $this->assertSame(1, $summary['grades_count']);

        $breakdown = $this->actingAs($c['admin'])->getJson("/api/cpl/course-breakdown/{$c['cpl']->id}")->assertOk()->json();
        $this->assertEquals(74, $breakdown[0]['average_score']);
        $this->assertSame(1, $breakdown[0]['students_graded']);
    }

    public function test_course_reports_ignore_obe_scores_that_are_not_locked(): void
    {
        $c = $this->context();
        $c['submission']->update(['status' => 'Submitted']);

        $summary = collect($this->actingAs($c['admin'])->getJson('/api/cpl/course-summary')->assertOk()->json())
            ->firstWhere('code', 'MKB-G');
        $this->assertSame(0, $summary['grades_count']);
    }

    public function test_used_master_data_cannot_be_deleted(): void
    {
        $c = $this->context();

        $this->actingAs($c['admin'])->deleteJson("/api/courses/{$c['course']->id}")
            ->assertStatus(409)->assertJsonPath('usage.penugasan dosen', 1);
        $this->actingAs($c['admin'])->postJson('/api/courses/bulk-delete', ['ids' => [$c['course']->id, $c['freeCourse']->id]])
            ->assertStatus(409);
        $this->assertDatabaseHas('courses', ['id' => $c['freeCourse']->id]);

        $this->actingAs($c['admin'])->deleteJson("/api/students/{$c['student']->id}")->assertStatus(409);
        $this->actingAs($c['admin'])->postJson('/api/students/bulk-delete', ['ids' => [$c['student']->id]])->assertStatus(409);
        $this->actingAs($c['admin'])->deleteJson("/api/lecturers/{$c['lecturer']->id}")->assertStatus(409);
        $this->actingAs($c['admin'])->deleteJson("/api/cpl/{$c['cpl']->id}")->assertStatus(409);
        $this->actingAs($c['super'])->deleteJson("/api/departments/{$c['department']->id}")->assertStatus(409);

        $this->assertSame(2, StudentAssessmentScore::count());
        $this->assertDatabaseHas('departments', ['id' => $c['department']->id]);
    }

    public function test_unused_master_data_can_still_be_deleted(): void
    {
        $c = $this->context();
        $freeCpl = Cpl::create(['department_id' => $c['department']->id, 'code' => 'CPL-9', 'description' => 'CPL bebas', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $freeStudent = Student::create(['id' => (string) Str::uuid(), 'department_id' => $c['department']->id, 'nim' => '25100', 'name' => 'Bebas', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif']);
        $emptyDepartment = Department::create(['id' => (string) Str::uuid(), 'code' => 'ZZ', 'name' => 'Prodi Kosong']);

        $this->actingAs($c['admin'])->deleteJson("/api/courses/{$c['freeCourse']->id}")->assertNoContent();
        $this->actingAs($c['admin'])->deleteJson("/api/cpl/{$freeCpl->id}")->assertNoContent();
        $this->actingAs($c['admin'])->postJson('/api/students/bulk-delete', ['ids' => [$freeStudent->id]])->assertOk();
        $this->actingAs($c['super'])->deleteJson("/api/departments/{$emptyDepartment->id}")->assertNoContent();

        TeachingAssignment::query()->delete();
        $this->actingAs($c['admin'])->deleteJson("/api/lecturers/{$c['lecturer']->id}")->assertNoContent();
    }

    private function context(): array
    {
        $department = Department::create(['id' => (string) Str::uuid(), 'code' => 'AK', 'name' => 'Akuntansi']);
        $super = $this->user('super_admin', null, 'super-guard@example.test');
        $admin = $this->user('admin_jurusan', $department->id, 'admin-guard@example.test');
        $lecturerUser = $this->user('dosen', $department->id, 'dosen-guard@example.test');
        $lecturer = Lecturer::create(['user_id' => $lecturerUser->id, 'department_id' => $department->id, 'employee_number' => 'NIP-G1', 'status' => 'Aktif']);
        $course = Course::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'MKB-G', 'name' => 'Akuntansi Lanjut', 'sks' => 3, 'semester' => 1]);
        $freeCourse = Course::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'code' => 'MKB-F', 'name' => 'Belum Dipakai', 'sks' => 2, 'semester' => 1]);
        $cpmk1 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK01-01', 'description' => 'CPMK 1', 'status' => 'Aktif']);
        $cpmk2 = Cpmk::create(['course_id' => $course->id, 'code' => 'CPMK02-01', 'description' => 'CPMK 2', 'status' => 'Aktif']);
        $cpl = Cpl::create(['department_id' => $department->id, 'code' => 'CPL-1', 'description' => 'CPL 1', 'category' => 'Terintegrasi', 'target_value' => 75]);
        $cpmk1->cplMappings()->create(['cpl_id' => $cpl->id, 'contribution_weight' => 100]);
        $cpmk2->cplMappings()->create(['cpl_id' => $cpl->id, 'contribution_weight' => 100]);
        $course->cplMappings()->create(['cpl_id' => $cpl->id, 'weight' => 1]);
        $period = AcademicPeriod::create(['department_id' => $department->id, 'academic_year' => '2025/2026', 'semester' => 'Ganjil', 'status' => 'Aktif']);
        $class = AcademicClass::create(['department_id' => $department->id, 'name' => 'A', 'cohort_year' => 2025, 'status' => 'Aktif']);
        $offering = CourseOffering::create(['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id, 'status' => 'Aktif']);
        TeachingAssignment::create(['course_offering_id' => $offering->id, 'lecturer_id' => $lecturer->id, 'role' => 'coordinator', 'status' => 'Aktif', 'assigned_by' => $admin->id]);
        $plan = AssessmentPlan::create(['course_offering_id' => $offering->id, 'version' => 1, 'status' => 'Published', 'published_by' => $admin->id, 'published_at' => now()]);
        $item1 = AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $cpmk1->id, 'category' => 'assignment', 'name' => 'Tugas', 'weight' => 40, 'sequence' => 1, 'is_required' => true]);
        $item2 = AssessmentItem::create(['assessment_plan_id' => $plan->id, 'cpmk_id' => $cpmk2->id, 'category' => 'final', 'name' => 'UAS', 'weight' => 60, 'sequence' => 2, 'is_required' => true]);
        $student = Student::create(['id' => (string) Str::uuid(), 'department_id' => $department->id, 'nim' => '25099', 'name' => 'Mahasiswa Uji', 'angkatan' => '2025', 'kelas' => 'A', 'status' => 'Aktif']);
        $enrollment = CourseEnrollment::create(['course_offering_id' => $offering->id, 'student_id' => $student->id, 'enrollment_status' => 'active']);
        StudentAssessmentScore::create(['course_enrollment_id' => $enrollment->id, 'assessment_item_id' => $item1->id, 'score' => 80, 'eligibility_status' => 'eligible']);
        StudentAssessmentScore::create(['course_enrollment_id' => $enrollment->id, 'assessment_item_id' => $item2->id, 'score' => 70, 'eligibility_status' => 'eligible']);
        $submission = GradeSubmission::create(['assessment_plan_id' => $plan->id, 'status' => 'Locked', 'locked_by' => $admin->id, 'locked_at' => now()]);

        return compact('department', 'super', 'admin', 'lecturer', 'course', 'freeCourse', 'cpl', 'student', 'submission');
    }

    private function user(string $role, ?string $departmentId, string $email): User
    {
        return User::create(['id' => (string) Str::uuid(), 'name' => $email, 'email' => $email, 'password' => Hash::make('password123'), 'role' => $role, 'department_id' => $departmentId]);
    }
}
