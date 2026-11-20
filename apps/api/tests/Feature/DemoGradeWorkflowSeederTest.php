<?php

namespace Tests\Feature;

use App\Models\AssessmentItem;
use App\Models\CourseEnrollment;
use App\Models\Cpmk;
use App\Models\GradeSubmission;
use App\Models\GraduateProfile;
use App\Models\StudentAssessmentScore;
use App\Models\TeachingAssignment;
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

        $this->assertSame(2, User::where('email', 'like', '%.demo@cpl.local')->count());
        $this->assertSame(6, CourseEnrollment::whereHas('student', fn ($query) => $query->where('nim', 'like', 'DEMO%'))->count());
        $this->assertSame(1, GradeSubmission::where('status', 'Draft')
            ->whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))
            ->count());
        $this->assertSame(1, GradeSubmission::where('status', 'Locked')
            ->whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))
            ->count());
        $this->assertSame(4, Cpmk::whereHas('course', fn ($query) => $query->where('code', 'MKK2462401108'))->count());
        $this->assertSame(100.0, (float) Cpmk::whereHas('course', fn ($query) => $query->where('code', 'MKK2462401108'))
            ->with('cplMappings')->get()->flatMap->cplMappings->sum('contribution_weight'));
        $this->assertSame(20, AssessmentItem::whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))->count());
        $this->assertSame(200.0, (float) AssessmentItem::whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))->sum('weight'));
        $this->assertSame(30, StudentAssessmentScore::whereHas('assessmentItem.assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'MKK2462401108'))->count());
        $this->assertSame(1, TeachingAssignment::where('role', 'member')->count());
        $this->assertSame(0, TeachingAssignment::where('role', 'coordinator')->count());
        $this->assertSame(6, GraduateProfile::where('status', 'Aktif')->count());

        foreach (['admin.demo@cpl.local', 'dosen.demo@cpl.local'] as $email) {
            $this->postJson('/api/login', ['email' => $email, 'password' => 'masung2'])
                ->assertOk();
            auth()->logout();
        }

        $admin = User::where('email', 'admin.demo@cpl.local')->firstOrFail();
        $response = $this->actingAs($admin)->getJson('/api/cpl/averages');
        $response->assertOk();

        $averages = collect($response->json())->keyBy('code');
        $this->assertSame(79, $averages->get('CPL-7')['value']);
        $this->assertSame(81, $averages->get('CPL-9')['value']);
        $this->assertSame(82, $averages->get('CPL-3')['value']);
        $this->assertSame(79, $averages->get('CPL-10')['value']);
        $this->assertSame('Belum Diukur', $averages->get('CPL-1')['status']);
    }
}
