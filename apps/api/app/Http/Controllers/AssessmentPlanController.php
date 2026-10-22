<?php

namespace App\Http\Controllers;

use App\Models\AssessmentItem;
use App\Models\AssessmentPlan;
use App\Models\Cpmk;
use App\Models\CourseOffering;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AssessmentPlanController extends Controller
{
    private array $relations = [
        'courseOffering.course',
        'courseOffering.academicClass',
        'courseOffering.academicPeriod',
        'items.cpmk.cplMappings.cpl',
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        abort_unless($user, 403, 'Unauthorized');

        $query = AssessmentPlan::with($this->relations)->orderByDesc('created_at');
        if ($user->role === 'dosen') {
            abort_unless($user->lecturer, 403, 'Profil dosen tidak ditemukan.');
            $query->where('status', 'Published')
                ->whereHas('courseOffering.teachingAssignments', fn ($assignment) => $assignment
                    ->where('lecturer_id', $user->lecturer->id)
                    ->where('status', 'Aktif'));
        } else {
            $this->authorizeAdministrator($user);
            $departmentId = $this->departmentId($request, $user);
            $query->whereHas('courseOffering.course', fn ($course) => $course->where('department_id', $departmentId));
        }

        if ($request->filled('courseOfferingId')) {
            $query->where('course_offering_id', $request->string('courseOfferingId'));
        }

        return response()->json($query->get()->map(fn (AssessmentPlan $plan) => $this->payload($plan)));
    }

    public function show(Request $request, AssessmentPlan $assessmentPlan)
    {
        $this->authorizeRead($request, $assessmentPlan);
        return response()->json($this->payload($assessmentPlan->load($this->relations)));
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);
        $validated = $request->validate([
            'courseOfferingId' => 'required|uuid|exists:course_offerings,id',
            'items' => 'nullable|array|max:100',
            ...$this->itemRules(),
        ]);

        $offering = CourseOffering::with('course')->findOrFail($validated['courseOfferingId']);
        abort_unless($offering->course->department_id === $departmentId, 403, 'Penawaran mata kuliah tidak berada pada jurusan Anda.');
        if ($offering->assessmentPlans()->where('status', 'Draft')->exists()) {
            throw ValidationException::withMessages(['courseOfferingId' => ['Masih ada rencana asesmen berstatus Draft untuk penawaran ini.']]);
        }

        $plan = DB::transaction(function () use ($validated, $offering) {
            $plan = AssessmentPlan::create([
                'course_offering_id' => $offering->id,
                'version' => ((int) $offering->assessmentPlans()->max('version')) + 1,
                'status' => 'Draft',
            ]);
            $this->replaceItems($plan, $validated['items'] ?? [], $offering->course_id);
            return $plan;
        });

        return response()->json($this->payload($plan->load($this->relations)), 201);
    }

    public function update(Request $request, AssessmentPlan $assessmentPlan)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $departmentId = $this->departmentId($request, $user);
        $this->ensureDepartment($assessmentPlan, $departmentId);
        abort_unless($assessmentPlan->status === 'Draft', 422, 'Hanya rencana Draft yang dapat diubah.');

        $validated = $request->validate(['items' => 'required|array|max:100', ...$this->itemRules()]);
        DB::transaction(fn () => $this->replaceItems($assessmentPlan, $validated['items'], $assessmentPlan->courseOffering->course_id));

        return response()->json($this->payload($assessmentPlan->fresh($this->relations)));
    }

    public function publish(Request $request, AssessmentPlan $assessmentPlan)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $this->ensureDepartment($assessmentPlan, $this->departmentId($request, $user));
        abort_unless($assessmentPlan->status === 'Draft', 422, 'Rencana asesmen sudah tidak berstatus Draft.');

        $assessmentPlan->load(['items', 'courseOffering.course.cpmks']);
        abort_if($assessmentPlan->items->isEmpty(), 422, 'Rencana asesmen belum memiliki komponen.');
        $total = round((float) $assessmentPlan->items->sum('weight'), 2);
        if (abs($total - 100.0) > 0.001) {
            throw ValidationException::withMessages(['items' => ["Total bobot harus tepat 100%. Total saat ini {$total}%."]]);
        }

        $requiredCpmkIds = $assessmentPlan->courseOffering->course->cpmks->where('status', 'Aktif')->pluck('id');
        $measuredCpmkIds = $assessmentPlan->items->pluck('cpmk_id')->unique();
        $missing = $requiredCpmkIds->diff($measuredCpmkIds);
        if ($missing->isNotEmpty()) {
            $codes = Cpmk::whereIn('id', $missing)->pluck('code')->implode(', ');
            throw ValidationException::withMessages(['items' => ["CPMK berikut belum memiliki komponen asesmen: {$codes}."]]);
        }

        DB::transaction(function () use ($assessmentPlan, $user) {
            AssessmentPlan::where('course_offering_id', $assessmentPlan->course_offering_id)
                ->where('status', 'Published')
                ->update(['status' => 'Archived']);
            $assessmentPlan->update([
                'status' => 'Published',
                'published_by' => $user->id,
                'published_at' => now(),
            ]);
        });

        return response()->json($this->payload($assessmentPlan->fresh($this->relations)));
    }

    public function destroy(Request $request, AssessmentPlan $assessmentPlan)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);
        $this->ensureDepartment($assessmentPlan, $this->departmentId($request, $user));
        abort_unless($assessmentPlan->status === 'Draft', 422, 'Hanya rencana Draft yang dapat dihapus.');
        $assessmentPlan->delete();

        return response()->json(null, 204);
    }

    private function itemRules(): array
    {
        return [
            'items.*.cpmkId' => 'required|uuid|exists:cpmks,id',
            'items.*.category' => ['required', Rule::in(['assignment', 'quiz', 'midterm', 'final', 'project', 'practice', 'presentation', 'other'])],
            'items.*.name' => 'required|string|max:150',
            'items.*.weight' => 'required|numeric|min:0.01|max:100',
            'items.*.sequence' => 'required|integer|min:1|max:100',
            'items.*.isRequired' => 'nullable|boolean',
        ];
    }

    private function replaceItems(AssessmentPlan $plan, array $items, string $courseId): void
    {
        $sequences = collect($items)->pluck('sequence');
        if ($sequences->duplicates()->isNotEmpty()) {
            throw ValidationException::withMessages(['items' => ['Urutan komponen asesmen tidak boleh duplikat.']]);
        }

        $validCpmkIds = Cpmk::where('course_id', $courseId)->whereIn('id', collect($items)->pluck('cpmkId'))->pluck('id');
        if ($validCpmkIds->count() !== collect($items)->pluck('cpmkId')->unique()->count()) {
            throw ValidationException::withMessages(['items' => ['Salah satu CPMK bukan milik mata kuliah pada rencana ini.']]);
        }

        $plan->items()->delete();
        foreach ($items as $item) {
            AssessmentItem::create([
                'assessment_plan_id' => $plan->id,
                'cpmk_id' => $item['cpmkId'],
                'category' => $item['category'],
                'name' => trim($item['name']),
                'weight' => $item['weight'],
                'sequence' => $item['sequence'],
                'is_required' => $item['isRequired'] ?? true,
            ]);
        }
    }

    private function authorizeRead(Request $request, AssessmentPlan $plan): void
    {
        $user = $request->user();
        abort_unless($user, 403, 'Unauthorized');
        if ($user->role === 'dosen') {
            abort_unless($plan->status === 'Published' && $user->lecturer && $plan->courseOffering()
                ->whereHas('teachingAssignments', fn ($assignment) => $assignment->where('lecturer_id', $user->lecturer->id)->where('status', 'Aktif'))->exists(), 403);
            return;
        }
        $this->authorizeAdministrator($user);
        $this->ensureDepartment($plan, $this->departmentId($request, $user));
    }

    private function authorizeAdministrator(?User $user): void
    {
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
    }

    private function departmentId(Request $request, User $user): string
    {
        $departmentId = $user->role === 'super_admin' ? $request->input('departmentId', $request->query('departmentId')) : $user->department_id;
        abort_unless($departmentId, 422, 'Jurusan belum ditentukan.');
        return $departmentId;
    }

    private function ensureDepartment(AssessmentPlan $plan, string $departmentId): void
    {
        abort_unless($plan->courseOffering()->whereHas('course', fn ($course) => $course->where('department_id', $departmentId))->exists(), 403, 'Rencana asesmen tidak berada pada jurusan Anda.');
    }

    private function payload(AssessmentPlan $plan): array
    {
        $offering = $plan->courseOffering;
        return [
            'id' => $plan->id,
            'courseOfferingId' => $plan->course_offering_id,
            'version' => $plan->version,
            'status' => $plan->status,
            'publishedAt' => $plan->published_at,
            'courseId' => $offering?->course_id,
            'courseCode' => $offering?->course?->code,
            'courseName' => $offering?->course?->name,
            'className' => $offering?->academicClass?->name,
            'cohortYear' => $offering?->academicClass?->cohort_year,
            'academicYear' => $offering?->academicPeriod?->academic_year,
            'semester' => $offering?->academicPeriod?->semester,
            'totalWeight' => round((float) $plan->items->sum('weight'), 2),
            'items' => $plan->items->map(fn (AssessmentItem $item) => [
                'id' => $item->id,
                'cpmkId' => $item->cpmk_id,
                'cpmkCode' => $item->cpmk?->code,
                'cplCode' => $item->cpmk?->cplMappings?->first()?->cpl?->code,
                'category' => $item->category,
                'name' => $item->name,
                'weight' => $item->weight,
                'sequence' => $item->sequence,
                'isRequired' => $item->is_required,
            ])->values(),
        ];
    }
}
