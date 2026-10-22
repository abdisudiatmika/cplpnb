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

            Course::where('department_id', $department->id)->where('code', 'DEMO-AKT101')->delete();
            $course = Course::updateOrCreate(
                ['department_id' => $department->id, 'code' => 'MKK2462401108'],
                ['name' => 'Data Analitik', 'sks' => 2, 'semester' => 1]
            );

            $cplDescriptions = [
                1 => 'Mampu menunjukkan sikap religius, etis, profesional, bertanggung jawab, disiplin, serta menjunjung nilai Pancasila dan etika profesi dalam pelaksanaan pekerjaan di bidang akuntansi.',
                2 => 'Mampu menguasai konsep dan prinsip akuntansi keuangan, akuntansi manajemen, perpajakan, audit, bisnis, dan ekonomi sebagai dasar penyelesaian pekerjaan di bidang akuntansi.',
                3 => 'Mampu menganalisis transaksi, informasi keuangan, biaya, penganggaran, dan permasalahan bisnis untuk mendukung pengambilan keputusan organisasi.',
                4 => 'Mampu menyusun, menyajikan, dan mengungkapkan laporan keuangan entitas jasa, dagang, manufaktur, dan sektor publik sesuai standar akuntansi yang berlaku.',
                5 => 'Mampu melaksanakan administrasi perpajakan, menghitung kewajiban perpajakan, dan menyusun pelaporan perpajakan sesuai ketentuan yang berlaku di Indonesia.',
                6 => 'Mampu menerapkan sistem informasi akuntansi, pengendalian internal, dan prosedur audit sesuai standar dan kebutuhan organisasi.',
                7 => 'Mampu memanfaatkan teknologi informasi, aplikasi digital, dan perangkat lunak akuntansi untuk mendukung penyelesaian pekerjaan secara efektif dan efisien.',
                8 => 'Mampu berkomunikasi, bekerja sama, dan menyusun laporan atau karya ilmiah secara efektif dalam bahasa Indonesia maupun bahasa Inggris.',
                9 => 'Mampu melakukan evaluasi, pengembangan kompetensi diri, supervisi pekerjaan, serta pengelolaan data dan dokumen secara akuntabel dan aman.',
                10 => 'Mampu menyelesaikan permasalahan pekerjaan bidang akuntansi secara logis, inovatif, adaptif, dan mandiri sesuai kebutuhan dunia usaha dan dunia industri.',
            ];
            $cpls = collect($cplDescriptions)->mapWithKeys(function ($description, $number) use ($department) {
                $cpl = Cpl::updateOrCreate(
                    ['department_id' => $department->id, 'code' => 'CPL-' . $number],
                    ['description' => $description, 'target_value' => 75]
                );
                return [$number => $cpl];
            });

            $cpmkDefinitions = [
                ['code' => 'CPMK07-01', 'cpl' => 7, 'weight' => 22.5, 'description' => 'Mahasiswa mampu menggunakan fungsi dan rumus aplikasi pengolah angka untuk mengolah data tabel akuntansi secara manual dan otomatis.'],
                ['code' => 'CPMK09-01', 'cpl' => 9, 'weight' => 25, 'description' => 'Mahasiswa mampu membersihkan, menyiapkan, dan mengorganisasi data sehingga tersimpan rapi, akurat, dan mudah ditelusuri.'],
                ['code' => 'CPMK03-01', 'cpl' => 3, 'weight' => 22.5, 'description' => 'Mahasiswa mampu menyajikan ringkasan data, bagan, grafik, dan hasil alat analisis data untuk mendukung analisis dan pengambilan keputusan.'],
                ['code' => 'CPMK10-01', 'cpl' => 10, 'weight' => 30, 'description' => 'Mahasiswa mampu menyusun otomasi sederhana dengan VBA untuk menyelesaikan pekerjaan pengolahan data berulang secara logis dan mandiri.'],
            ];
            $cpmks = collect($cpmkDefinitions)->mapWithKeys(function ($definition) use ($course, $cpls) {
                $cpmk = Cpmk::updateOrCreate(
                    ['course_id' => $course->id, 'code' => $definition['code']],
                    ['description' => $definition['description'], 'curriculum_version' => 'RPS OBE 2025 v02', 'status' => 'Aktif']
                );
                $cpmk->cplMappings()->delete();
                $cpmk->cplMappings()->create([
                    'cpl_id' => $cpls[$definition['cpl']]->id,
                    'contribution_weight' => $definition['weight'],
                ]);
                return [$definition['code'] => $cpmk];
            });

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
            $assessmentDefinitions = [
                ['CPMK07-01', 'assignment', 'Tugas 1', 7.5],
                ['CPMK07-01', 'quiz', 'Kuis 1', 2.5],
                ['CPMK07-01', 'midterm', 'UTS CPMK07-01', 12.5],
                ['CPMK09-01', 'assignment', 'Tugas 2', 7.5],
                ['CPMK09-01', 'quiz', 'Kuis 2', 2.5],
                ['CPMK09-01', 'midterm', 'UTS CPMK09-01', 7.5],
                ['CPMK09-01', 'final', 'UAS CPMK09-01', 7.5],
                ['CPMK03-01', 'assignment', 'Tugas 3', 7.5],
                ['CPMK03-01', 'quiz', 'Kuis 3', 2.5],
                ['CPMK03-01', 'midterm', 'UTS CPMK03-01', 5],
                ['CPMK03-01', 'final', 'UAS CPMK03-01', 7.5],
                ['CPMK10-01', 'project', 'Tugas 4 Proyek VBA', 17.5],
                ['CPMK10-01', 'quiz', 'Kuis 4', 2.5],
                ['CPMK10-01', 'final', 'UAS CPMK10-01', 10],
            ];
            $items = collect($assessmentDefinitions)->map(function ($definition, $index) use ($plan, $cpmks) {
                return AssessmentItem::updateOrCreate(
                    ['assessment_plan_id' => $plan->id, 'sequence' => $index + 1],
                    ['cpmk_id' => $cpmks[$definition[0]]->id, 'category' => $definition[1], 'name' => $definition[2], 'weight' => $definition[3], 'is_required' => true]
                );
            });
            AssessmentItem::where('assessment_plan_id', $plan->id)->where('sequence', '>', count($assessmentDefinitions))->delete();

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
            $scoreIds = StudentAssessmentScore::whereIn('assessment_item_id', $items->pluck('id'))->pluck('id');
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
