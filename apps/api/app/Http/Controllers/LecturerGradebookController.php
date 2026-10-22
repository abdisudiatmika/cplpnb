<?php

namespace App\Http\Controllers;

use App\Models\AssessmentPlan;
use App\Models\CourseEnrollment;
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
            ->get();

        return response()->json($assignments->map(fn (TeachingAssignment $assignment) => $this->assignmentPayload($assignment)));
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
        $validEnrollmentIds = CourseEnrollment::where('course_offering_id', $teachingAssignment->course_offering_id)
            ->whereIn('id', collect($validated['scores'])->pluck('enrollmentId'))->pluck('id');
        $validItemIds = $plan->items()->whereIn('id', collect($validated['scores'])->pluck('assessmentItemId'))->pluck('id');
        abort_unless(
            $validEnrollmentIds->count() === collect($validated['scores'])->pluck('enrollmentId')->unique()->count()
            && $validItemIds->count() === collect($validated['scores'])->pluck('assessmentItemId')->unique()->count(),
            422,
            'Salah satu mahasiswa atau komponen tidak termasuk dalam buku nilai ini.'
        );

        DB::transaction(function () use ($validated, $user) {
            foreach ($validated['scores'] as $entry) {
                $score = StudentAssessmentScore::firstOrNew([
                    'course_enrollment_id' => $entry['enrollmentId'],
                    'assessment_item_id' => $entry['assessmentItemId'],
                ]);
                if (!$score->exists) {
                    $score->entered_by = $user->id;
                    $score->entered_at = now();
                }
                $score->score = array_key_exists('score', $entry) ? $entry['score'] : null;
                $score->eligibility_status = $entry['eligibilityStatus'];
                $score->note = $entry['note'] ?? null;
                $score->updated_by = $user->id;
                $score->save();
            }
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
            $score = $scores->get($item->id);
            return $score && $score->eligibility_status === 'eligible' && $score->score !== null;
        });
        $finalScore = $requiredComplete
            ? round((float) $plan->items->sum(fn ($item) => ((float) ($scores->get($item->id)?->score ?? 0)) * ((float) $item->weight) / 100), 2)
            : null;

        $cpmkScores = $plan->items->groupBy('cpmk_id')->map(function ($items) use ($scores) {
            $complete = $items->where('is_required', true)->every(fn ($item) => ($score = $scores->get($item->id)) && $score->eligibility_status === 'eligible' && $score->score !== null);
            if (!$complete) return null;
            $weight = (float) $items->sum('weight');
            return $weight > 0
                ? round((float) $items->sum(fn ($item) => ((float) ($scores->get($item->id)?->score ?? 0)) * (float) $item->weight) / $weight, 2)
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
            abort_unless($user->lecturer && $assignment->lecturer_id === $user->lecturer->id && $assignment->status === 'Aktif', 403, 'Anda tidak ditugaskan pada kelas ini.');
            return;
        }
        abort_unless(in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        if ($user->role === 'admin_jurusan') {
            abort_unless($assignment->courseOffering()->whereHas('course', fn ($course) => $course->where('department_id', $user->department_id))->exists(), 403);
        }
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
        ];
    }
}
