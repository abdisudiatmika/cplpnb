<?php

namespace App\Http\Controllers;

use App\Models\AssessmentPlan;
use App\Models\CourseEnrollment;
use App\Models\GradeAuditLog;
use App\Models\GradeSubmission;
use App\Models\Student;
use App\Models\StudentAssessmentScore;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LecturerGradebookController extends Controller
{
    private array $assignmentRelations = [
        'lecturer.user',
        'courseOffering.course',
        'courseOffering.academicClass',
        'courseOffering.academicPeriod',
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'dosen' && $user->lecturer, 403, 'Hanya dosen yang dapat mengakses buku nilai.');

        $assignments = TeachingAssignment::with($this->assignmentRelations)
            ->where('lecturer_id', $user->lecturer->id)
            ->where('status', 'Aktif')
            ->whereHas('courseOffering.assessmentPlans', fn ($plan) => $plan->where('status', 'Published'))
            ->orderByDesc('created_at')
            ->get()
            // Kelas periode berjalan di atas; kelas periode yang sudah diarsipkan tetap tampil
            // sebagai riwayat yang hanya bisa dilihat.
            ->sortBy(fn (TeachingAssignment $assignment) => $assignment->courseOffering?->academicPeriod?->status === 'Aktif' ? 0 : 1)
            ->values();

        return response()->json($assignments->map(fn (TeachingAssignment $assignment) => $this->assignmentSummaryPayload($assignment)));
    }

    public function show(Request $request, TeachingAssignment $teachingAssignment)
    {
        $this->authorizeAssignment($request->user(), $teachingAssignment);

        return response()->json($this->gradebookPayload($teachingAssignment));
    }

    public function syncEnrollments(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        $teachingAssignment->load($this->assignmentRelations);
        $departmentId = $teachingAssignment->courseOffering->course->department_id;
        if ($user->role === 'admin_jurusan') {
            abort_unless($user->department_id === $departmentId, 403, 'Penugasan tidak berada pada jurusan Anda.');
        }

        $class = $teachingAssignment->courseOffering->academicClass;
        $students = Student::where('department_id', $departmentId)
            ->where('angkatan', (string) $class->cohort_year)
            ->whereRaw('UPPER(kelas) = ?', [strtoupper($class->name)])
            ->where('status', 'Aktif')
            ->get();

        DB::transaction(function () use ($students, $teachingAssignment) {
            foreach ($students as $student) {
                CourseEnrollment::firstOrCreate([
                    'course_offering_id' => $teachingAssignment->course_offering_id,
                    'student_id' => $student->id,
                ], ['enrollment_status' => 'active']);
            }
        });

        return response()->json([
            'matchedStudents' => $students->count(),
            'enrollments' => CourseEnrollment::where('course_offering_id', $teachingAssignment->course_offering_id)->count(),
        ]);
    }

    public function saveScores(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAssignment($user, $teachingAssignment, true);
        $validated = $request->validate([
            'scores' => 'required|array|max:5000',
            'scores.*.enrollmentId' => 'required|uuid|exists:course_enrollments,id',
            'scores.*.assessmentItemId' => 'required|uuid|exists:assessment_items,id',
            'scores.*.score' => 'nullable|numeric|min:0|max:100',
            'scores.*.eligibilityStatus' => ['required', Rule::in(['eligible', 'not_eligible_attendance', 'excused', 'absent', 'makeup_exam'])],
            'scores.*.note' => 'nullable|string|max:1000',
        ]);

        $plan = $this->publishedPlan($teachingAssignment);
        $submission = GradeSubmission::firstOrCreate(
            ['assessment_plan_id' => $plan->id],
            ['status' => 'Draft']
        );
        abort_unless($submission->status === 'Draft', 409, 'Nilai tidak dapat diubah karena sudah diajukan atau dikunci.');
        $validEnrollmentIds = CourseEnrollment::where('course_offering_id', $teachingAssignment->course_offering_id)
            ->whereIn('id', collect($validated['scores'])->pluck('enrollmentId'))->pluck('id');
        $validItemIds = $plan->items()->whereIn('id', collect($validated['scores'])->pluck('assessmentItemId'))->pluck('id');
        abort_unless(
            $validEnrollmentIds->count() === collect($validated['scores'])->pluck('enrollmentId')->unique()->count()
            && $validItemIds->count() === collect($validated['scores'])->pluck('assessmentItemId')->unique()->count(),
            422,
            'Salah satu mahasiswa atau komponen tidak termasuk dalam buku nilai ini.'
        );

        DB::transaction(function () use ($validated, $user, $plan) {
            foreach ($validated['scores'] as $entry) {
                $score = StudentAssessmentScore::firstOrNew([
                    'course_enrollment_id' => $entry['enrollmentId'],
                    'assessment_item_id' => $entry['assessmentItemId'],
                ]);
                $oldScore = $score->exists ? $score->score : null;
                $oldEligibility = $score->exists ? $score->eligibility_status : null;
                $oldNote = $score->exists ? $score->note : null;
                if (! $score->exists) {
                    $score->entered_by = $user->id;
                    $score->entered_at = now();
                }
                $score->score = array_key_exists('score', $entry) ? $entry['score'] : null;
                $score->eligibility_status = $entry['eligibilityStatus'];
                $score->note = $entry['note'] ?? null;
                $score->updated_by = $user->id;
                $score->save();

                if ($oldScore !== $score->score || $oldEligibility !== $score->eligibility_status || $oldNote !== $score->note) {
                    GradeAuditLog::create([
                        'assessment_plan_id' => $plan->id,
                        'score_id' => $score->id,
                        'old_score' => $oldScore,
                        'new_score' => $score->score,
                        'action' => 'score_updated',
                        'user_id' => $user->id,
                    ]);
                }
            }
        });

        return response()->json($this->gradebookPayload($teachingAssignment->fresh()));
    }

    public function submit(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAssignment($user, $teachingAssignment, true);
        $plan = $this->publishedPlan($teachingAssignment);
        $submission = GradeSubmission::firstOrCreate(['assessment_plan_id' => $plan->id], ['status' => 'Draft']);
        abort_unless($submission->status === 'Draft', 409, 'Buku nilai sudah pernah diajukan.');

        $enrollments = CourseEnrollment::with('scores')
            ->where('course_offering_id', $teachingAssignment->course_offering_id)
            ->where('enrollment_status', 'active')->get();
        abort_if($enrollments->isEmpty(), 422, 'Belum ada mahasiswa pada buku nilai ini.');
        $requiredItemIds = $plan->items()->where('is_required', true)->pluck('id');
        $incomplete = $enrollments->contains(function ($enrollment) use ($requiredItemIds) {
            $scores = $enrollment->scores->keyBy('assessment_item_id');

            return $requiredItemIds->contains(fn ($itemId) => ! $this->scoreIsComplete($scores->get($itemId)));
        });
        abort_if($incomplete, 422, 'Nilai wajib belum lengkap untuk seluruh mahasiswa.');

        DB::transaction(function () use ($submission, $plan, $user) {
            $submission->update(['status' => 'Submitted', 'submitted_by' => $user->id, 'submitted_at' => now(), 'reopen_reason' => null]);
            $this->audit($plan, 'submitted', $user);
        });

        return response()->json($this->gradebookPayload($teachingAssignment->fresh()));
    }

    public function saveAnalysis(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAssignment($user, $teachingAssignment, true);
        $validated = $request->validate(['analysis' => 'nullable|string|max:10000']);
        $plan = $this->publishedPlan($teachingAssignment);
        $submission = GradeSubmission::firstOrCreate(['assessment_plan_id' => $plan->id], ['status' => 'Draft']);
        abort_unless($submission->status === 'Draft', 409, 'Analisis tidak dapat diubah karena nilai sudah diajukan atau dikunci.');
        $submission->update(['cpmk_analysis' => $validated['analysis'] ?? null]);
        $this->audit($plan, 'analysis_updated', $user);

        return response()->json($this->gradebookPayload($teachingAssignment->fresh()));
    }

    public function approve(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeApprover($user, $teachingAssignment);
        $plan = $this->publishedPlan($teachingAssignment);
        $submission = GradeSubmission::where('assessment_plan_id', $plan->id)->firstOrFail();
        abort_unless($submission->status === 'Submitted', 409, 'Hanya nilai berstatus Diajukan yang dapat disetujui.');

        DB::transaction(function () use ($submission, $plan, $user) {
            $submission->update(['status' => 'Approved', 'approved_by' => $user->id, 'approved_at' => now()]);
            $this->audit($plan, 'approved', $user);
        });

        return response()->json($this->gradebookPayload($teachingAssignment->fresh()));
    }

    public function lock(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAdmin($user, $teachingAssignment);
        $plan = $this->publishedPlan($teachingAssignment);
        $submission = GradeSubmission::where('assessment_plan_id', $plan->id)->firstOrFail();
        abort_unless($submission->status === 'Approved', 409, 'Hanya nilai yang telah disetujui yang dapat dikunci.');

        DB::transaction(function () use ($submission, $plan, $user) {
            $submission->update(['status' => 'Locked', 'locked_by' => $user->id, 'locked_at' => now()]);
            $this->audit($plan, 'locked', $user);
        });

        return response()->json($this->gradebookPayload($teachingAssignment->fresh()));
    }

    public function reopen(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAdmin($user, $teachingAssignment);
        $validated = $request->validate(['reason' => 'required|string|min:10|max:1000']);
        $plan = $this->publishedPlan($teachingAssignment);
        $submission = GradeSubmission::where('assessment_plan_id', $plan->id)->firstOrFail();
        abort_unless($submission->status === 'Locked', 409, 'Hanya nilai terkunci yang dapat dibuka kembali.');

        DB::transaction(function () use ($submission, $plan, $user, $validated) {
            $submission->update([
                'status' => 'Draft',
                'submitted_by' => null,
                'submitted_at' => null,
                'approved_by' => null,
                'approved_at' => null,
                'locked_by' => null,
                'locked_at' => null,
                'reopen_reason' => $validated['reason'],
            ]);
            $this->audit($plan, 'reopened', $user, $validated['reason']);
        });

        return response()->json($this->gradebookPayload($teachingAssignment->fresh()));
    }

    private function gradebookPayload(TeachingAssignment $assignment): array
    {
        $assignment->load($this->assignmentRelations);
        $plan = $this->publishedPlan($assignment)->load(['items.cpmk.cplMappings.cpl']);
        $enrollments = CourseEnrollment::with(['student', 'scores'])
            ->where('course_offering_id', $assignment->course_offering_id)
            ->where('enrollment_status', 'active')
            ->get()
            ->sortBy(fn ($enrollment) => $enrollment->student?->nim)
            ->values();

        return [
            'assignment' => $this->assignmentPayload($assignment),
            'submission' => $this->submissionPayload($plan->gradeSubmission),
            'plan' => [
                'id' => $plan->id,
                'version' => $plan->version,
                'items' => $plan->items->map(fn ($item) => [
                    'id' => $item->id,
                    'cpmkId' => $item->cpmk_id,
                    'cpmkCode' => $item->cpmk?->code,
                    'cplCode' => $item->cpmk?->cplMappings?->first()?->cpl?->code,
                    'name' => $item->name,
                    'category' => $item->category,
                    'weight' => $item->weight,
                    'isRequired' => $item->is_required,
                ])->values(),
            ],
            'students' => $enrollments->map(fn ($enrollment) => $this->studentPayload($enrollment, $plan))->values(),
        ];
    }

    private function studentPayload(CourseEnrollment $enrollment, AssessmentPlan $plan): array
    {
        $scores = $enrollment->scores->keyBy('assessment_item_id');
        $scorePayload = $plan->items->mapWithKeys(function ($item) use ($scores) {
            $score = $scores->get($item->id);

            return [$item->id => [
                'score' => $score?->score,
                'eligibilityStatus' => $score?->eligibility_status ?? 'eligible',
                'note' => $score?->note,
            ]];
        });

        $requiredComplete = $plan->items->where('is_required', true)->every(function ($item) use ($scores) {
            return $this->scoreIsComplete($scores->get($item->id));
        });
        $finalScore = $requiredComplete
            ? round((float) $plan->items->sum(fn ($item) => ((float) ($scores->get($item->id)?->score ?? 0)) * ((float) $item->weight) / 100), 2)
            : null;

        $cpmkScores = $plan->items->groupBy('cpmk_id')->map(function ($items) use ($scores) {
            $complete = $items->where('is_required', true)->every(fn ($item) => $this->scoreIsComplete($scores->get($item->id)));
            if (! $complete) {
                return null;
            }
            $weight = (float) $items->sum('weight');

            return $weight > 0
                ? round((float) $items->sum(fn ($item) => ((float) ($scores->get($item->id)?->score ?? 0)) * (float) $item->weight) / $weight, 2)
                : null;
        });

        $cplBuckets = [];
        foreach ($plan->items->groupBy('cpmk_id') as $cpmkId => $items) {
            $cpmkScore = $cpmkScores->get($cpmkId);
            foreach ($items->first()?->cpmk?->cplMappings ?? [] as $mapping) {
                $code = $mapping->cpl?->code;
                if (! $code) {
                    continue;
                }
                $cplBuckets[$code][] = ['score' => $cpmkScore, 'weight' => (float) $mapping->contribution_weight];
            }
        }
        $cplScores = collect($cplBuckets)->map(function ($entries) {
            if (collect($entries)->contains(fn ($entry) => $entry['score'] === null)) {
                return null;
            }
            $weight = collect($entries)->sum('weight');

            return $weight > 0
                ? round(collect($entries)->sum(fn ($entry) => (float) $entry['score'] * $entry['weight']) / $weight, 2)
                : null;
        });

        return [
            'enrollmentId' => $enrollment->id,
            'studentId' => $enrollment->student_id,
            'nim' => $enrollment->student?->nim,
            'name' => $enrollment->student?->name,
            'scores' => $scorePayload,
            'isComplete' => $requiredComplete,
            'finalScore' => $finalScore,
            'cpmkScores' => $cpmkScores,
            'cplScores' => $cplScores,
        ];
    }

    private function publishedPlan(TeachingAssignment $assignment): AssessmentPlan
    {
        return AssessmentPlan::where('course_offering_id', $assignment->course_offering_id)
            ->where('status', 'Published')->latest('version')->firstOrFail();
    }

    private function authorizeAssignment(?User $user, TeachingAssignment $assignment, bool $write = false): void
    {
        abort_unless($user, 403, 'Unauthorized');
        if ($user->role === 'dosen') {
            abort_unless(
                $user->lecturer
                && $assignment->lecturer_id === $user->lecturer->id
                && $assignment->status === 'Aktif',
                403,
                'Penugasan ini tidak aktif.'
            );
            // Periode yang sudah diarsipkan tetap bisa dibuka dosen, tetapi hanya untuk dilihat.
            if ($write) {
                abort_unless(
                    $assignment->courseOffering?->academicPeriod?->status === 'Aktif',
                    403,
                    'Periode ini sudah diarsipkan. Buku nilai hanya dapat dilihat.'
                );
            }

            return;
        }
        abort_unless(in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        if ($user->role === 'admin_jurusan') {
            abort_unless($assignment->courseOffering()->whereHas('course', fn ($course) => $course->where('department_id', $user->department_id))->exists(), 403);
        }
    }

    private function authorizeApprover(?User $user, TeachingAssignment $assignment): void
    {
        $this->authorizeAdmin($user, $assignment);
    }

    private function authorizeAdmin(?User $user, TeachingAssignment $assignment): void
    {
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Hanya admin yang dapat melakukan tindakan ini.');
        if ($user->role === 'admin_jurusan') {
            abort_unless($assignment->courseOffering()->whereHas('course', fn ($course) => $course->where('department_id', $user->department_id))->exists(), 403);
        }
    }

    private function audit(AssessmentPlan $plan, string $action, User $user, ?string $reason = null): void
    {
        GradeAuditLog::create(['assessment_plan_id' => $plan->id, 'action' => $action, 'reason' => $reason, 'user_id' => $user->id]);
    }

    private function submissionPayload(?GradeSubmission $submission): array
    {
        return [
            'id' => $submission?->id,
            'status' => $submission?->status ?? 'Draft',
            'submittedAt' => $submission?->submitted_at?->toISOString(),
            'approvedAt' => $submission?->approved_at?->toISOString(),
            'lockedAt' => $submission?->locked_at?->toISOString(),
            'reopenReason' => $submission?->reopen_reason,
            'cpmkAnalysis' => $submission?->cpmk_analysis,
        ];
    }

    private function scoreIsComplete(?StudentAssessmentScore $score): bool
    {
        if (! $score) {
            return false;
        }
        if (in_array($score->eligibility_status, ['not_eligible_attendance', 'absent'], true)) {
            return true;
        }

        return $score->eligibility_status === 'eligible' && $score->score !== null;
    }

    private function assignmentPayload(TeachingAssignment $assignment): array
    {
        $offering = $assignment->courseOffering;

        return [
            'id' => $assignment->id,
            'courseOfferingId' => $assignment->course_offering_id,
            'role' => $assignment->role,
            'courseCode' => $offering?->course?->code,
            'courseName' => $offering?->course?->name,
            'className' => $offering?->academicClass?->name,
            'cohortYear' => $offering?->academicClass?->cohort_year,
            'academicYear' => $offering?->academicPeriod?->academic_year,
            'semester' => $offering?->academicPeriod?->semester,
            'periodStatus' => $offering?->academicPeriod?->status,
            'periodArchived' => $offering?->academicPeriod?->status !== 'Aktif',
        ];
    }

    private function assignmentSummaryPayload(TeachingAssignment $assignment): array
    {
        $payload = $this->assignmentPayload($assignment);
        $plan = $this->publishedPlan($assignment);
        $enrollments = CourseEnrollment::with('scores')
            ->where('course_offering_id', $assignment->course_offering_id)
            ->where('enrollment_status', 'active')
            ->get();
        $requiredItemIds = $plan->items()->where('is_required', true)->pluck('id');
        $completedStudents = $enrollments->filter(function ($enrollment) use ($requiredItemIds) {
            $scores = $enrollment->scores->keyBy('assessment_item_id');

            return $requiredItemIds->every(fn ($itemId) => $this->scoreIsComplete($scores->get($itemId)));
        })->count();

        return [
            ...$payload,
            'gradeStatus' => $plan->gradeSubmission?->status ?? 'Draft',
            'studentCount' => $enrollments->count(),
            'completedStudents' => $completedStudents,
            'assessmentItemCount' => $plan->items()->count(),
        ];
    }
}
