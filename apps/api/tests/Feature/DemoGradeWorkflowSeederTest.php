<?php

namespace Tests\Feature;

use App\Models\CourseEnrollment;
use App\Models\AssessmentItem;
use App\Models\Cpmk;
use App\Models\GradeSubmission;
use App\Models\User;
use Database\Seeders\DemoGradeWorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoGradeWorkflowSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_workflow_seeder_is_repeatable_and_accounts_can_login(): void
    {
        $this->seed(DemoGradeWorkflowSeeder::class);
        $this->seed(DemoGradeWorkflowSeeder::class);

        $this->assertSame(3, User::where('email', 'like', '%.demo@cpl.local')->count());
        $this->assertSame(3, CourseEnrollment::whereHas('student', fn ($query) => $query->where('nim', 'like', 'DEMO%'))->count());
        $this->assertSame(1, GradeSubmission::where('status', 'Draft')
            ->whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))
            ->count());
        $this->assertSame(4, Cpmk::whereHas('course', fn ($query) => $query->where('code', 'MKK2462401108'))->count());
        $this->assertSame(100.0, (float) Cpmk::whereHas('course', fn ($query) => $query->where('code', 'MKK2462401108'))
            ->with('cplMappings')->get()->flatMap->cplMappings->sum('contribution_weight'));
        $this->assertSame(14, AssessmentItem::whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))->count());
        $this->assertSame(100.0, (float) AssessmentItem::whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))->sum('weight'));

        foreach (['admin.demo@cpl.local', 'koordinator.demo@cpl.local', 'dosen.demo@cpl.local'] as $email) {
            $this->postJson('/api/login', ['email' => $email, 'password' => 'DemoCpl2026!'])
                ->assertOk();
            auth()->logout();
        }
    }
}
