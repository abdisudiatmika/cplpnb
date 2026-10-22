<?php

namespace Database\Seeders;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Course;
use App\Models\CourseEnrollment;
use App\Models\Department;
use App\Models\GradeAuditLog;
use App\Models\GradeSubmission;
use App\Models\Lecturer;
use App\Models\Student;
use App\Models\StudentAssessmentScore;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoGradeWorkflowSeeder extends Seeder
{
    public function run(): void
    {
        if (!app()->environment('local', 'testing')) {
            throw new \RuntimeException('Seeder demo hanya boleh dijalankan pada environment lokal/testing.');
        }

        DB::transaction(function () {
            $department = Department::updateOrCreate(
                ['code' => 'DEMO-AK'],
                ['name' => 'D3 Akuntansi Demo']
            );

            $admin = $this->user('admin.demo@cpl.local', 'Admin Demo Akuntansi', 'admin_jurusan', $department->id);
            $coordinatorUser = $this->user('koordinator.demo@cpl.local', 'Dr. Koordinator Demo', 'dosen', $department->id);
            $memberUser = $this->user('dosen.demo@cpl.local', 'Dosen Anggota Demo', 'dosen', $department->id);

            $coordinator = Lecturer::updateOrCreate(
                ['employee_number' => 'DEMO-NIP-001'],
                ['user_id' => $coordinatorUser->id, 'department_id' => $department->id, 'status' => 'Aktif']
            );
            $member = Lecturer::updateOrCreate(
                ['employee_number' => 'DEMO-NIP-002'],
                ['user_id' => $memberUser->id, 'department_id' => $department->id, 'status' => 'Aktif']
            );

            $course = Course::updateOrCreate(
                ['department_id' => $department->id, 'code' => 'DEMO-AKT101'],
                ['name' => 'Praktikum Akuntansi Terintegrasi', 'sks' => 3, 'semester' => 1]
            );
            $cpl1 = Cpl::updateOrCreate(
                ['department_id' => $department->id, 'code' => 'CPL-1'],
                ['description' => 'Mampu menyusun proses akuntansi secara terintegrasi.', 'target_value' => 75]
            );
            $cpl2 = Cpl::updateOrCreate(
                ['department_id' => $department->id, 'code' => 'CPL-2'],
                ['description' => 'Mampu menganalisis informasi keuangan untuk pengambilan keputusan.', 'target_value' => 75]
            );
            $cpmk1 = Cpmk::updateOrCreate(
                ['course_id' => $course->id, 'code' => 'CPMK01-01'],
                ['description' => 'Menyusun siklus akuntansi dasar.', 'curriculum_version' => 'Demo 2026', 'status' => 'Aktif']
            );
            $cpmk2 = Cpmk::updateOrCreate(
                ['course_id' => $course->id, 'code' => 'CPMK02-01'],
                ['description' => 'Menganalisis hasil laporan keuangan.', 'curriculum_version' => 'Demo 2026', 'status' => 'Aktif']
            );
            $cpmk1->cplMappings()->updateOrCreate(['cpl_id' => $cpl1->id], ['contribution_weight' => 100]);
            $cpmk2->cplMappings()->updateOrCreate(['cpl_id' => $cpl2->id], ['contribution_weight' => 100]);

            $period = AcademicPeriod::updateOrCreate(
                ['department_id' => $department->id, 'academic_year' => '2026/2027', 'semester' => 'Ganjil'],
                ['status' => 'Aktif']
            );
            $class = AcademicClass::updateOrCreate(
                ['department_id' => $department->id, 'name' => 'DEMO-A', 'cohort_year' => 2026],
                ['status' => 'Aktif']
            );
            $offering = \App\Models\CourseOffering::updateOrCreate(
                ['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id],
                ['status' => 'Aktif']
            );

            $coordinatorAssignment = TeachingAssignment::updateOrCreate(
                ['course_offering_id' => $offering->id, 'lecturer_id' => $coordinator->id],
                ['role' => 'coordinator', 'status' => 'Aktif', 'assigned_by' => $admin->id]
            );
            $memberAssignment = TeachingAssignment::updateOrCreate(
                ['course_offering_id' => $offering->id, 'lecturer_id' => $member->id],
                ['role' => 'member', 'status' => 'Aktif', 'assigned_by' => $admin->id]
            );

            $plan = AssessmentPlan::updateOrCreate(
                ['course_offering_id' => $offering->id, 'version' => 1],
                ['status' => 'Published', 'published_by' => $admin->id, 'published_at' => now()]
            );
            $item1 = AssessmentItem::updateOrCreate(
                ['assessment_plan_id' => $plan->id, 'sequence' => 1],
                ['cpmk_id' => $cpmk1->id, 'category' => 'assignment', 'name' => 'Tugas Siklus Akuntansi', 'weight' => 40, 'is_required' => true]
            );
            $item2 = AssessmentItem::updateOrCreate(
                ['assessment_plan_id' => $plan->id, 'sequence' => 2],
                ['cpmk_id' => $cpmk2->id, 'category' => 'final', 'name' => 'UAS Analisis Laporan', 'weight' => 60, 'is_required' => true]
            );

            foreach ([
                ['nim' => 'DEMO26001', 'name' => 'Ayu Mahasiswa Demo'],
                ['nim' => 'DEMO26002', 'name' => 'Made Mahasiswa Demo'],
                ['nim' => 'DEMO26003', 'name' => 'Komang Mahasiswa Demo'],
            ] as $studentData) {
                $student = Student::updateOrCreate(
                    ['nim' => $studentData['nim']],
                    ['department_id' => $department->id, 'name' => $studentData['name'], 'angkatan' => '2026', 'kelas' => 'DEMO-A', 'status' => 'Aktif']
                );
                CourseEnrollment::updateOrCreate(
                    ['course_offering_id' => $offering->id, 'student_id' => $student->id],
                    ['enrollment_status' => 'active']
                );
            }

            // Re-running the demo seeder restores a clean Draft workflow.
            $scoreIds = StudentAssessmentScore::whereIn('assessment_item_id', [$item1->id, $item2->id])->pluck('id');
            GradeAuditLog::where('assessment_plan_id', $plan->id)->delete();
            GradeAuditLog::whereIn('score_id', $scoreIds)->delete();
            StudentAssessmentScore::whereIn('id', $scoreIds)->delete();
            GradeSubmission::updateOrCreate(
                ['assessment_plan_id' => $plan->id],
                ['status' => 'Draft', 'submitted_by' => null, 'submitted_at' => null, 'approved_by' => null, 'approved_at' => null, 'locked_by' => null, 'locked_at' => null, 'reopen_reason' => null]
            );

            $this->command?->info('Demo siap. Assignment anggota: ' . $memberAssignment->id . '; koordinator: ' . $coordinatorAssignment->id);
        });
    }

    private function user(string $email, string $name, string $role, string $departmentId): User
    {
        $user = User::firstOrNew(['email' => $email]);
        if (!$user->exists) $user->id = (string) Str::uuid();
        $user->fill(['name' => $name, 'password' => Hash::make('DemoCpl2026!'), 'role' => $role, 'department_id' => $departmentId]);
        $user->save();

        return $user;
    }
}
