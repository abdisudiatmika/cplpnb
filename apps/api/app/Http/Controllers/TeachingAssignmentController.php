<?php

namespace App\Http\Controllers;

use App\Models\AcademicClass;
use App\Models\AcademicPeriod;
use App\Models\Course;
use App\Models\CourseOffering;
use App\Models\Lecturer;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TeachingAssignmentController extends Controller
{
    private array $relations = [
        'lecturer.user',
        'courseOffering.course',
        'courseOffering.academicClass',
        'courseOffering.academicPeriod',
        'courseOffering.assessmentPlans.gradeSubmission',
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);

        $query = TeachingAssignment::with($this->relations)
            ->whereHas('courseOffering.course', fn ($course) => $course->where('department_id', $departmentId))
            ->orderByDesc('created_at');

        if ($request->filled('academicYear')) {
            $query->whereHas('courseOffering.academicPeriod', fn ($period) => $period->where('academic_year', $request->string('academicYear')));
        }
        if ($request->filled('semester')) {
            $query->whereHas('courseOffering.academicPeriod', fn ($period) => $period->where('semester', $request->string('semester')));
        }

        return response()->json($query->get()->map(fn (TeachingAssignment $assignment) => $this->payload($assignment)));
    }

    public function me(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'dosen' && $user->lecturer, 403, 'Hanya dosen yang dapat mengakses penugasan ini.');

        $assignments = TeachingAssignment::with($this->relations)
            ->where('lecturer_id', $user->lecturer->id)
            ->where('status', 'Aktif')
            ->whereHas('courseOffering.academicPeriod', fn ($period) => $period->where('status', 'Aktif'))
            ->orderByDesc('created_at')
            ->get();

        return response()->json($assignments->map(fn (TeachingAssignment $assignment) => $this->payload($assignment)));
    }

    public function periods(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);

        return response()->json($this->periodPayloads($departmentId));
    }

    public function activatePeriod(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);
        $validated = $request->validate($this->periodRules());

        DB::transaction(function () use ($departmentId, $validated) {
            AcademicPeriod::where('department_id', $departmentId)
                ->where('status', 'Aktif')
                ->update(['status' => 'Selesai']);

            AcademicPeriod::updateOrCreate(
                [
                    'department_id' => $departmentId,
                    'academic_year' => $validated['academicYear'],
                    'semester' => $validated['semester'],
                ],
                ['status' => 'Aktif']
            );
        });

        return response()->json($this->periodPayloads($departmentId));
    }

    public function archivePeriod(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);
        $validated = $request->validate($this->periodRules());

        AcademicPeriod::where('department_id', $departmentId)
            ->where('academic_year', $validated['academicYear'])
            ->where('semester', $validated['semester'])
            ->update(['status' => 'Selesai']);

        return response()->json($this->periodPayloads($departmentId));
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);
        $validated = $request->validate($this->storeRules());

        $course = Course::where('department_id', $departmentId)->findOrFail($validated['courseId']);
        $lecturer = Lecturer::where('department_id', $departmentId)->findOrFail($validated['lecturerId']);
        if ($lecturer->status !== 'Aktif') {
            throw ValidationException::withMessages(['lecturerId' => ['Dosen nonaktif tidak dapat diberi penugasan.']]);
        }

        $assignment = DB::transaction(function () use ($validated, $departmentId, $course, $lecturer, $user) {
            $period = AcademicPeriod::firstOrCreate(
                [
                    'department_id' => $departmentId,
                    'academic_year' => $validated['academicYear'],
                    'semester' => $validated['semester'],
                ],
                ['status' => 'Aktif']
            );
            if ($period->status !== 'Aktif') {
                throw ValidationException::withMessages(['academicYear' => ['Periode ini sudah diarsipkan. Aktifkan kembali periode sebelum menambah penugasan.']]);
            }

            $academicClass = AcademicClass::firstOrCreate(
                [
                    'department_id' => $departmentId,
                    'name' => strtoupper(trim($validated['className'])),
                    'cohort_year' => $validated['cohortYear'],
                ],
                ['status' => 'Aktif']
            );

            $offering = CourseOffering::firstOrCreate(
                [
                    'course_id' => $course->id,
                    'academic_class_id' => $academicClass->id,
                    'academic_period_id' => $period->id,
                ],
                ['status' => 'Aktif']
            );

            $duplicate = TeachingAssignment::where('course_offering_id', $offering->id)
                ->where('lecturer_id', $lecturer->id)
                ->exists();
            if ($duplicate) {
                throw ValidationException::withMessages(['lecturerId' => ['Dosen sudah ditugaskan pada mata kuliah, kelas, dan periode tersebut.']]);
            }

            return TeachingAssignment::create([
                'course_offering_id' => $offering->id,
                'lecturer_id' => $lecturer->id,
                'role' => 'member',
                'status' => $validated['status'] ?? 'Aktif',
                'assigned_by' => $user->id,
            ]);
        });

        return response()->json($this->payload($assignment->load($this->relations)), 201);
    }

    public function update(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);
        $this->ensureDepartment($teachingAssignment, $departmentId);

        $validated = $request->validate([
            'status' => ['sometimes', 'required', Rule::in(['Aktif', 'Nonaktif'])],
        ]);

        $teachingAssignment->update([...$validated, 'role' => 'member']);

        return response()->json($this->payload($teachingAssignment->fresh($this->relations)));
    }

    public function destroy(Request $request, TeachingAssignment $teachingAssignment)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $this->ensureDepartment($teachingAssignment, $this->departmentId($request, $user));
        $teachingAssignment->delete();

        return response()->json(null, 204);
    }

    private function storeRules(): array
    {
        return [
            'lecturerId' => 'required|uuid|exists:lecturers,id',
            'courseId' => 'required|uuid|exists:courses,id',
            'className' => 'required|string|max:50',
            'cohortYear' => 'required|integer|min:2000|max:2100',
            'academicYear' => ['required', 'string', 'max:20', 'regex:/^[0-9]{4}\/[0-9]{4}$/'],
            'semester' => ['required', Rule::in(['Ganjil', 'Genap'])],
            'status' => ['nullable', Rule::in(['Aktif', 'Nonaktif'])],
            'departmentId' => 'nullable|uuid|exists:departments,id',
        ];
    }

    private function periodRules(): array
    {
        return [
            'academicYear' => ['required', 'string', 'max:20', 'regex:/^[0-9]{4}\/[0-9]{4}$/'],
            'semester' => ['required', Rule::in(['Ganjil', 'Genap'])],
            'departmentId' => 'nullable|uuid|exists:departments,id',
        ];
    }

    private function periodPayloads(string $departmentId)
    {
        return AcademicPeriod::where('department_id', $departmentId)
            ->withCount('offerings')
            ->orderByDesc('academic_year')
            ->orderBy('semester')
            ->get()
            ->map(fn (AcademicPeriod $period) => [
                'id' => $period->id,
                'academicYear' => $period->academic_year,
                'semester' => $period->semester,
                'status' => $period->status,
                'offeringCount' => $period->offerings_count,
            ]);
    }

    private function authorizeAdministrator(?User $user): void
    {
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
    }

    private function departmentId(Request $request, User $user): string
    {
        $departmentId = $user->role === 'super_admin'
            ? $request->input('departmentId', $request->query('departmentId'))
            : $user->department_id;
        abort_unless($departmentId, 422, 'Jurusan belum ditentukan.');

        return $departmentId;
    }

    private function ensureDepartment(TeachingAssignment $assignment, string $departmentId): void
    {
        abort_unless(
            $assignment->courseOffering()->whereHas('course', fn ($course) => $course->where('department_id', $departmentId))->exists(),
            403,
            'Penugasan tidak berada pada jurusan Anda.'
        );
    }

    private function payload(TeachingAssignment $assignment): array
    {
        $offering = $assignment->courseOffering;
        $publishedPlan = $offering?->assessmentPlans
            ?->where('status', 'Published')
            ->sortByDesc('version')
            ->first();

        return [
            'id' => $assignment->id,
            'courseOfferingId' => $assignment->course_offering_id,
            'role' => $assignment->role,
            'status' => $assignment->status,
            'lecturerId' => $assignment->lecturer_id,
            'lecturerName' => $assignment->lecturer?->user?->name,
            'employeeNumber' => $assignment->lecturer?->employee_number,
            'courseId' => $offering?->course_id,
            'courseCode' => $offering?->course?->code,
            'courseName' => $offering?->course?->name,
            'className' => $offering?->academicClass?->name,
            'cohortYear' => $offering?->academicClass?->cohort_year,
            'academicYear' => $offering?->academicPeriod?->academic_year,
            'semester' => $offering?->academicPeriod?->semester,
            'periodStatus' => $offering?->academicPeriod?->status,
            'offeringStatus' => $offering?->status,
            'gradeStatus' => $publishedPlan?->gradeSubmission?->status ?? ($publishedPlan ? 'Draft' : null),
        ];
    }
}
