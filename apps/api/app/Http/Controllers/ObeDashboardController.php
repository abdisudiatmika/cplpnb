<?php

namespace App\Http\Controllers;

use App\Models\AssessmentPlan;
use App\Models\Cpl;
use App\Models\Cpmk;
use App\Models\User;
use Illuminate\Http\Request;

class ObeDashboardController extends Controller
{
    public function summary(Request $request)
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        $departmentId = $user->role === 'super_admin' ? $request->input('departmentId') : $user->department_id;
        abort_unless($departmentId, 422, 'Jurusan belum ditentukan.');

        $plans = AssessmentPlan::with([
            'gradeSubmission',
            'items.cpmk.cplMappings.cpl',
            'courseOffering.course',
            'courseOffering.enrollments.student',
            'courseOffering.enrollments.scores',
        ])->where('status', 'Published')
            ->whereHas('courseOffering.course', fn ($query) => $query->where('department_id', $departmentId))
            ->get()
            ->groupBy('course_offering_id')
            ->map(fn ($versions) => $versions->sortByDesc('version')->first())
            ->values();

        $statuses = ['Draft' => 0, 'Submitted' => 0, 'Approved' => 0, 'Locked' => 0];
        foreach ($plans as $plan) $statuses[$plan->gradeSubmission?->status ?? 'Draft']++;

        $cpmkObservations = [];
        $cplObservations = [];
        foreach ($plans->where(fn ($plan) => $plan->gradeSubmission?->status === 'Locked') as $plan) {
            $enrollments = $plan->courseOffering->enrollments->where('enrollment_status', 'active');
            if ($request->filled('angkatan')) $enrollments = $enrollments->where('student.angkatan', $request->string('angkatan')->toString());
            if ($request->filled('kelas')) $enrollments = $enrollments->filter(fn ($enrollment) => strtoupper((string) $enrollment->student?->kelas) === strtoupper($request->string('kelas')->toString()));
            foreach ($enrollments as $enrollment) {
                $scores = $enrollment->scores->keyBy('assessment_item_id');
                foreach ($plan->items->groupBy('cpmk_id') as $cpmkId => $items) {
                    $complete = $items->where('is_required', true)->every(fn ($item) => $this->scoreComplete($scores->get($item->id)));
                    if (!$complete) continue;
                    $itemWeight = (float) $items->sum('weight');
                    if ($itemWeight <= 0) continue;
                    $score = round((float) $items->sum(fn ($item) => (float) ($scores->get($item->id)?->score ?? 0) * (float) $item->weight) / $itemWeight, 2);
                    $cpmkObservations[$cpmkId][] = $score;
                    foreach ($items->first()?->cpmk?->cplMappings ?? [] as $mapping) {
                        $cplObservations[$mapping->cpl_id][] = ['score' => $score, 'weight' => (float) $mapping->contribution_weight];
                    }
                }
            }
        }

        $cpmks = Cpmk::with('course')->where('status', 'Aktif')
            ->whereHas('course', fn ($query) => $query->where('department_id', $departmentId))->get()
            ->map(function ($cpmk) use ($cpmkObservations) {
                $values = collect($cpmkObservations[$cpmk->id] ?? []);
                $value = $values->isEmpty() ? null : round((float) $values->average(), 2);
                return ['id' => $cpmk->id, 'code' => $cpmk->code, 'courseCode' => $cpmk->course?->code, 'courseName' => $cpmk->course?->name, 'value' => $value, 'status' => $this->status($value)];
            })->sortBy(fn ($item) => $item['value'] ?? 999)->values();

        $cpls = Cpl::where('department_id', $departmentId)->orderBy('code')->get()
            ->map(function ($cpl) use ($cplObservations) {
                $entries = collect($cplObservations[$cpl->id] ?? []);
                $weight = (float) $entries->sum('weight');
                $value = $weight > 0 ? round((float) $entries->sum(fn ($entry) => $entry['score'] * $entry['weight']) / $weight, 2) : null;
                return ['id' => $cpl->id, 'code' => $cpl->code, 'value' => $value, 'status' => $this->status($value)];
            });

        return response()->json(['cpls' => $cpls, 'cpmks' => $cpmks, 'gradeStatuses' => $statuses, 'publishedPlans' => $plans->count()]);
    }

    private function scoreComplete($score): bool
    {
        if (!$score) return false;
        if (in_array($score->eligibility_status, ['not_eligible_attendance', 'absent'], true)) return true;
        return $score->eligibility_status === 'eligible' && $score->score !== null;
    }

    private function status(?float $value): string
    {
        if ($value === null) return 'Belum Diukur';
        return $value >= 75 ? 'Kompeten' : 'Belum Kompeten';
    }
}
