<?php

namespace Database\Seeders;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Course;
use App\Models\CourseCplMapping;
use App\Models\CourseEnrollment;
use App\Models\CourseOffering;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\Department;
use App\Models\GradeAuditLog;
use App\Models\GradeSubmission;
use App\Models\GraduateProfile;
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
    private const PASSWORD = 'demo-sicpl-2026';

    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            throw new \RuntimeException('Seeder demo hanya boleh dijalankan pada environment lokal/testing.');
        }

        DB::transaction(function () {
            $department = Department::updateOrCreate(['code' => 'DEMO-AK'], ['name' => 'D3 Akuntansi Demo']);
            $admin = $this->user('admin.demo@cpl.local', 'Admin Demo Akuntansi', 'admin_jurusan', $department->id);
            $lecturerUser = $this->user('dosen.demo@cpl.local', 'I Made Dosen Demo, S.E., M.Ak.', 'dosen', $department->id);
            $this->removeLegacyCoordinator();
            $lecturer = Lecturer::updateOrCreate(
                ['user_id' => $lecturerUser->id],
                ['employee_number' => 'DEMO-NIP-001', 'department_id' => $department->id, 'status' => 'Aktif']
            );

            $course = Course::updateOrCreate(
                ['department_id' => $department->id, 'code' => 'MKK2462401108'],
                ['name' => 'Data Analitik', 'sks' => 2, 'semester' => 1]
            );
            $cpls = $this->seedCpls($department->id);
            $cpmks = $this->seedCpmks($course, $cpls);
            $this->syncCourseCpls($course, $cpmks);
            $this->seedGraduateProfiles($department->id, $cpls);

            $period = AcademicPeriod::updateOrCreate(
                ['department_id' => $department->id, 'academic_year' => '2026/2027', 'semester' => 'Ganjil'],
                ['status' => 'Aktif']
            );
            $completedOffering = $this->offering($department->id, $course, $period, 'DEMO-A');
            $practiceOffering = $this->offering($department->id, $course, $period, 'DEMO-B');
            $completedAssignment = TeachingAssignment::updateOrCreate(
                ['course_offering_id' => $completedOffering->id, 'lecturer_id' => $lecturer->id],
                ['role' => 'member', 'status' => 'Aktif', 'assigned_by' => $admin->id]
            );
            TeachingAssignment::where('course_offering_id', $practiceOffering->id)->delete();

            $completedPlan = $this->plan($completedOffering, $cpmks, $admin);
            $practicePlan = $this->plan($practiceOffering, $cpmks, $admin);
            $completedStudents = $this->students($department->id, $completedOffering, 'DEMO-A', [
                ['DEMO26001', 'Ayu Mahasiswa Demo'],
                ['DEMO26002', 'Made Mahasiswa Demo'],
                ['DEMO26003', 'Komang Mahasiswa Demo'],
            ]);
            $this->students($department->id, $practiceOffering, 'DEMO-B', [
                ['DEMO26004', 'Ni Luh Putri Demo'],
                ['DEMO26005', 'I Wayan Aditya Demo'],
                ['DEMO26006', 'Kadek Surya Demo'],
            ]);

            $this->seedCompletedScores($completedPlan, $completedStudents, $lecturerUser, $admin);
            $this->resetPracticeScores($practicePlan);

            $this->command?->info('Demo siap. DEMO-A sudah terukur; DEMO-B siap untuk simulasi penugasan dan input nilai.');
            $this->command?->info('Admin: admin.demo@cpl.local / '.self::PASSWORD);
            $this->command?->info('Dosen: dosen.demo@cpl.local / '.self::PASSWORD);
            $this->command?->info('Assignment DEMO-A: '.$completedAssignment->id);
        });
    }

    private function seedCpls(string $departmentId)
    {
        $descriptions = [
            1 => 'Mampu menunjukkan sikap profesional, bertanggung jawab, disiplin, dan menjunjung etika profesi dalam pekerjaan akuntansi.',
            2 => 'Mampu menguasai konsep akuntansi, perpajakan, audit, bisnis, dan ekonomi sebagai dasar penyelesaian pekerjaan.',
            3 => 'Mampu menganalisis transaksi, informasi keuangan, biaya, anggaran, dan permasalahan bisnis untuk mendukung keputusan.',
            4 => 'Mampu menyusun dan menyajikan laporan keuangan sesuai standar akuntansi yang berlaku.',
            5 => 'Mampu melaksanakan administrasi, penghitungan, dan pelaporan perpajakan sesuai ketentuan.',
            6 => 'Mampu menerapkan sistem informasi akuntansi, pengendalian internal, dan prosedur audit.',
            7 => 'Mampu memanfaatkan teknologi informasi, aplikasi digital, dan perangkat lunak akuntansi secara efektif.',
            8 => 'Mampu berkomunikasi, bekerja sama, dan menyusun laporan secara efektif.',
            9 => 'Mampu mengevaluasi dan mengembangkan kompetensi diri serta mengelola data dan dokumen secara aman.',
            10 => 'Mampu menyelesaikan permasalahan akuntansi secara logis, inovatif, adaptif, dan mandiri.',
        ];

        return collect($descriptions)->mapWithKeys(function ($description, $number) use ($departmentId) {
            $cpl = Cpl::updateOrCreate(
                ['department_id' => $departmentId, 'code' => 'CPL-'.$number],
                ['description' => $description, 'target_value' => 75]
            );

            return [$number => $cpl];
        });
    }

    private function seedCpmks(Course $course, $cpls)
    {
        $definitions = [
            ['CPMK07-01', 7, 22.5, 'Mampu menggunakan aplikasi pengolah angka untuk mengolah data tabel akuntansi.'],
            ['CPMK09-01', 9, 25, 'Mampu membersihkan, menyiapkan, dan mengorganisasi data secara akurat.'],
            ['CPMK03-01', 3, 22.5, 'Mampu menyajikan ringkasan, bagan, grafik, dan hasil analisis data untuk pengambilan keputusan.'],
            ['CPMK10-01', 10, 30, 'Mampu menyusun otomasi sederhana dengan VBA untuk pekerjaan pengolahan data berulang.'],
        ];

        return collect($definitions)->mapWithKeys(function ($definition) use ($course, $cpls) {
            $cpmk = Cpmk::updateOrCreate(
                ['course_id' => $course->id, 'code' => $definition[0]],
                ['description' => $definition[3], 'curriculum_version' => 'RPS OBE 2025 v02', 'status' => 'Aktif']
            );
            $cpmk->cplMappings()->delete();
            $cpmk->cplMappings()->create(['cpl_id' => $cpls[$definition[1]]->id, 'contribution_weight' => $definition[2]]);

            return [$definition[0] => $cpmk];
        });
    }

    private function syncCourseCpls(Course $course, $cpmks): void
    {
        CourseCplMapping::where('course_id', $course->id)->delete();
        $cpmks->flatMap->cplMappings->groupBy('cpl_id')->each(function ($mappings, $cplId) use ($course) {
            CourseCplMapping::create(['course_id' => $course->id, 'cpl_id' => $cplId, 'weight' => $mappings->sum('contribution_weight')]);
        });
    }

    private function seedGraduateProfiles(string $departmentId, $cpls): void
    {
        $definitions = [
            ['PL-1', 'Staf Akuntansi dan Keuangan', [4], [1, 2, 3, 7, 8, 10]],
            ['PL-2', 'Staf Pajak', [5], [1, 2, 7, 8]],
            ['PL-3', 'Staf Anggaran', [3], [1, 2, 7, 8, 10]],
            ['PL-4', 'Junior Auditor', [6], [1, 2, 7, 8, 9]],
            ['PL-5', 'Staf Akuntan Biaya dan Manajemen', [3], [1, 2, 4, 7, 8]],
            ['PL-6', 'Staf Analis Sistem', [6, 7], [1, 2, 3, 4, 5, 8, 9]],
        ];

        foreach ($definitions as $index => [$code, $name, $core, $supporting]) {
            $profile = GraduateProfile::updateOrCreate(
                ['department_id' => $departmentId, 'curriculum_version' => '2026', 'code' => $code],
                ['name' => $name, 'summary' => 'Profil pekerjaan lulusan '.$name.' yang didukung oleh capaian pembelajaran terkait.', 'status' => 'Aktif', 'sequence' => $index + 1]
            );
            $profile->cplMappings()->delete();
            foreach ($core as $number) {
                $profile->cplMappings()->create(['cpl_id' => $cpls[$number]->id, 'contribution_type' => 'core']);
            }
            foreach ($supporting as $number) {
                $profile->cplMappings()->create(['cpl_id' => $cpls[$number]->id, 'contribution_type' => 'supporting']);
            }
        }
    }

    private function offering(string $departmentId, Course $course, AcademicPeriod $period, string $className): CourseOffering
    {
        $class = AcademicClass::updateOrCreate(
            ['department_id' => $departmentId, 'name' => $className, 'cohort_year' => 2026],
            ['status' => 'Aktif']
        );

        return CourseOffering::updateOrCreate(
            ['course_id' => $course->id, 'academic_class_id' => $class->id, 'academic_period_id' => $period->id],
            ['status' => 'Aktif']
        );
    }

    private function plan(CourseOffering $offering, $cpmks, User $admin): AssessmentPlan
    {
        $plan = AssessmentPlan::updateOrCreate(
            ['course_offering_id' => $offering->id, 'version' => 1],
            ['status' => 'Published', 'published_by' => $admin->id, 'published_at' => now()]
        );
        $definitions = [
            ['CPMK07-01', 'assignment', 'Tugas Pengolahan Data', 10],
            ['CPMK07-01', 'midterm', 'UTS Pengolah Angka', 12.5],
            ['CPMK09-01', 'assignment', 'Tugas Pembersihan Data', 10],
            ['CPMK09-01', 'quiz', 'Kuis Kualitas Data', 5],
            ['CPMK09-01', 'final', 'UAS Manajemen Data', 10],
            ['CPMK03-01', 'assignment', 'Tugas Visualisasi', 10],
            ['CPMK03-01', 'presentation', 'Presentasi Analisis', 5],
            ['CPMK03-01', 'final', 'UAS Analisis Data', 7.5],
            ['CPMK10-01', 'project', 'Proyek Otomasi VBA', 20],
            ['CPMK10-01', 'final', 'UAS Otomasi', 10],
        ];
        foreach ($definitions as $index => $definition) {
            AssessmentItem::updateOrCreate(
                ['assessment_plan_id' => $plan->id, 'sequence' => $index + 1],
                ['cpmk_id' => $cpmks[$definition[0]]->id, 'category' => $definition[1], 'name' => $definition[2], 'weight' => $definition[3], 'is_required' => true]
            );
        }
        AssessmentItem::where('assessment_plan_id', $plan->id)->where('sequence', '>', count($definitions))->delete();

        return $plan;
    }

    private function students(string $departmentId, CourseOffering $offering, string $className, array $definitions)
    {
        return collect($definitions)->map(function ($definition) use ($departmentId, $offering, $className) {
            $student = Student::updateOrCreate(
                ['nim' => $definition[0]],
                ['department_id' => $departmentId, 'name' => $definition[1], 'angkatan' => '2026', 'kelas' => $className, 'status' => 'Aktif']
            );
            $enrollment = CourseEnrollment::updateOrCreate(
                ['course_offering_id' => $offering->id, 'student_id' => $student->id],
                ['enrollment_status' => 'active']
            );

            return compact('student', 'enrollment');
        });
    }

    private function seedCompletedScores(AssessmentPlan $plan, $students, User $lecturer, User $admin): void
    {
        $items = $plan->items()->orderBy('sequence')->get();
        $baseScores = [88, 80, 72];
        foreach ($students->values() as $studentIndex => $entry) {
            foreach ($items as $itemIndex => $item) {
                $score = max(0, min(100, $baseScores[$studentIndex] + (($itemIndex % 4) - 1) * 2));
                StudentAssessmentScore::updateOrCreate(
                    ['course_enrollment_id' => $entry['enrollment']->id, 'assessment_item_id' => $item->id],
                    ['score' => $score, 'eligibility_status' => 'eligible', 'note' => null, 'entered_by' => $lecturer->id, 'updated_by' => $lecturer->id, 'entered_at' => now()]
                );
            }
        }
        GradeAuditLog::where('assessment_plan_id', $plan->id)->delete();
        GradeSubmission::updateOrCreate(
            ['assessment_plan_id' => $plan->id],
            ['status' => 'Locked', 'submitted_by' => $lecturer->id, 'submitted_at' => now(), 'approved_by' => $admin->id, 'approved_at' => now(), 'locked_by' => $admin->id, 'locked_at' => now(), 'reopen_reason' => null, 'cpmk_analysis' => 'Sebagian besar mahasiswa telah mencapai CPMK. Penguatan diberikan pada visualisasi dan otomasi data.']
        );
    }

    private function resetPracticeScores(AssessmentPlan $plan): void
    {
        $itemIds = $plan->items()->pluck('id');
        $scoreIds = StudentAssessmentScore::whereIn('assessment_item_id', $itemIds)->pluck('id');
        GradeAuditLog::where('assessment_plan_id', $plan->id)->orWhereIn('score_id', $scoreIds)->delete();
        StudentAssessmentScore::whereIn('id', $scoreIds)->delete();
        GradeSubmission::updateOrCreate(
            ['assessment_plan_id' => $plan->id],
            ['status' => 'Draft', 'submitted_by' => null, 'submitted_at' => null, 'approved_by' => null, 'approved_at' => null, 'locked_by' => null, 'locked_at' => null, 'reopen_reason' => null, 'cpmk_analysis' => null]
        );
    }

    private function removeLegacyCoordinator(): void
    {
        $user = User::where('email', 'koordinator.demo@cpl.local')->first();
        if (! $user) {
            return;
        }
        if ($user->lecturer) {
            TeachingAssignment::where('lecturer_id', $user->lecturer->id)->delete();
            $user->lecturer->delete();
        }
        $user->delete();
    }

    private function user(string $email, string $name, string $role, string $departmentId): User
    {
        $user = User::firstOrNew(['email' => $email]);
        if (! $user->exists) {
            $user->id = (string) Str::uuid();
        }
        $user->fill(['name' => $name, 'password' => Hash::make(self::PASSWORD), 'role' => $role, 'department_id' => $departmentId]);
        $user->save();

        return $user;
    }
}
