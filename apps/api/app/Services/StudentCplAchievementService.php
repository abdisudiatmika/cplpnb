<?php

namespace App\Services;

use App\Models\AssessmentPlan;
use App\Models\StudentAssessmentScore;
use Illuminate\Support\Collection;

class StudentCplAchievementService
{
    /**
     * Return the locked CPMK results used to calculate a student's CPL.
     * This is intentionally separate from calculate() so existing dashboard
     * consumers keep receiving the compact CPL map.
     */
    public function details(Collection $students, ?string $semesterType = null, ?string $academicYear = null): Collection
    {
        $studentIds = $students->pluck('id')->filter()->values();
        if ($studentIds->isEmpty()) {
            return collect();
        }

        $normalizedSemester = strtolower(trim((string) $semesterType));
        $plans = AssessmentPlan::with([
            'gradeSubmission',
            'items.cpmk.cplMappings.cpl',
            'courseOffering.course',
            'courseOffering.academicClass',
            'courseOffering.academicPeriod',
            'courseOffering.enrollments' => fn ($query) => $query
                ->whereIn('student_id', $studentIds)
                ->where('enrollment_status', 'active')
                ->with('scores'),
        ])
            ->where('status', 'Published')
            ->whereHas('courseOffering.enrollments', fn ($query) => $query
                ->whereIn('student_id', $studentIds)
                ->where('enrollment_status', 'active'))
            ->when(in_array($normalizedSemester, ['ganjil', 'genap'], true), fn ($query) => $query
                ->whereHas('courseOffering.academicPeriod', fn ($period) => $period
                    ->where('semester', ucfirst($normalizedSemester))))
            ->when($academicYear, fn ($query) => $query
                ->whereHas('courseOffering.academicPeriod', fn ($period) => $period
                    ->where('academic_year', $academicYear)))
            ->get()
            ->groupBy('course_offering_id')
            ->map(fn ($versions) => $versions->sortByDesc(fn ($plan) => (int) $plan->version)->first())
            ->filter(fn ($plan) => $plan->gradeSubmission?->status === 'Locked');

        $result = [];
        foreach ($plans as $plan) {
            foreach ($plan->courseOffering->enrollments as $enrollment) {
                $scores = $enrollment->scores->keyBy('assessment_item_id');
                foreach ($plan->items->groupBy('cpmk_id') as $items) {
                    $complete = $items->where('is_required', true)
                        ->every(fn ($item) => $this->scoreIsComplete($scores->get($item->id)));
                    $weight = (float) $items->sum('weight');
                    if (! $complete || $weight <= 0) {
                        continue;
                    }

                    $score = round((float) $items->sum(
                        fn ($item) => (float) ($scores->get($item->id)?->score ?? 0) * (float) $item->weight
                    ) / $weight, 2);
                    $cpmk = $items->first()?->cpmk;
                    if (! $cpmk) {
                        continue;
                    }

                    $result[$enrollment->student_id][] = [
                        'cpmkId' => $cpmk->id,
                        'cpmkCode' => $cpmk->code,
                        'description' => $cpmk->description,
                        'courseCode' => $plan->courseOffering->course?->code,
                        'courseName' => $plan->courseOffering->course?->name,
                        'className' => $plan->courseOffering->academicClass?->name,
                        'period' => $plan->courseOffering->academicPeriod
                            ? trim(($plan->courseOffering->academicPeriod->semester ?? '') . ' ' . ($plan->courseOffering->academicPeriod->academic_year ?? ''))
                            : null,
                        'score' => $score,
                        'status' => $score >= 75 ? 'Tercapai' : 'Belum Tercapai',
                        'cpls' => $cpmk->cplMappings->map(fn ($mapping) => [
                            'code' => $mapping->cpl?->code,
                            'weight' => (float) $mapping->contribution_weight,
                        ])->filter(fn ($mapping) => $mapping['code'])->values()->all(),
                    ];
                }
            }
        }

        return collect($result)->map(fn ($rows) => collect($rows)->sortBy('cpmkCode')->values());
    }

    public function calculate(Collection $students, ?string $semesterType = null, ?string $academicYear = null): Collection
    {
        $studentIds = $students->pluck('id')->filter()->values();
        if ($studentIds->isEmpty()) {
            return collect();
        }

        $normalizedSemester = strtolower(trim((string) $semesterType));
        $plans = AssessmentPlan::with([
            'gradeSubmission',
            'items.cpmk.cplMappings',
            'courseOffering.academicPeriod',
            'courseOffering.enrollments' => fn ($query) => $query
                ->whereIn('student_id', $studentIds)
                ->where('enrollment_status', 'active')
                ->with('scores'),
        ])
            ->where('status', 'Published')
            ->whereHas('courseOffering.enrollments', fn ($query) => $query
                ->whereIn('student_id', $studentIds)
                ->where('enrollment_status', 'active'))
            ->when(in_array($normalizedSemester, ['ganjil', 'genap'], true), fn ($query) => $query
                ->whereHas('courseOffering.academicPeriod', fn ($period) => $period
                    ->where('semester', ucfirst($normalizedSemester))))
            ->when($academicYear, fn ($query) => $query
                ->whereHas('courseOffering.academicPeriod', fn ($period) => $period
                    ->where('academic_year', $academicYear)))
            ->get()
            ->groupBy('course_offering_id')
            ->map(fn ($versions) => $versions->sortByDesc(fn ($plan) => (int) $plan->version)->first())
            ->filter(fn ($plan) => $plan->gradeSubmission?->status === 'Locked');

        $buckets = [];
        foreach ($plans as $plan) {
            foreach ($plan->courseOffering->enrollments as $enrollment) {
                $scores = $enrollment->scores->keyBy('assessment_item_id');
                foreach ($plan->items->groupBy('cpmk_id') as $items) {
                    $complete = $items->where('is_required', true)
                        ->every(fn ($item) => $this->scoreIsComplete($scores->get($item->id)));
                    $itemWeight = (float) $items->sum('weight');
                    if (! $complete || $itemWeight <= 0) {
                        continue;
                    }

                    $cpmkScore = round((float) $items->sum(
                        fn ($item) => (float) ($scores->get($item->id)?->score ?? 0) * (float) $item->weight
                    ) / $itemWeight, 2);

                    foreach ($items->first()?->cpmk?->cplMappings ?? [] as $mapping) {
                        $weight = (float) $mapping->contribution_weight;
                        if ($weight <= 0) {
                            continue;
                        }
                        $buckets[$enrollment->student_id][$mapping->cpl_id][] = [
                            'score' => $cpmkScore,
                            'weight' => $weight,
                        ];
                    }
                }
            }
        }

        return $studentIds->mapWithKeys(function ($studentId) use ($buckets) {
            $scores = collect($buckets[$studentId] ?? [])->map(function ($entries) {
                $entries = collect($entries);
                $weight = (float) $entries->sum('weight');

                return $weight > 0
                    ? round((float) $entries->sum(fn ($entry) => $entry['score'] * $entry['weight']) / $weight, 2)
                    : null;
            })->filter(fn ($value) => $value !== null);

            return [$studentId => $scores];
        });
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
}
