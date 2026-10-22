<?php

namespace Tests\Feature;

use App\Models\CourseEnrollment;
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
            ->whereHas('assessmentPlan.courseOffering.course', fn ($query) => $query->where('code', 'DEMO-AKT101'))
            ->count());

        foreach (['admin.demo@cpl.local', 'koordinator.demo@cpl.local', 'dosen.demo@cpl.local'] as $email) {
            $this->postJson('/api/login', ['email' => $email, 'password' => 'DemoCpl2026!'])
                ->assertOk();
            auth()->logout();
        }
    }
}
