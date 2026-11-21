<?php

namespace App\Http\Controllers;

use App\Models\Lecturer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class LecturerController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $this->authorizeAdministrator($user);

        $query = Lecturer::with(['user', 'department'])->orderByDesc('created_at');
        if ($user->role === 'admin_jurusan') {
            $query->where('department_id', $user->department_id);
        }

        return response()->json($query->get()->map(fn (Lecturer $lecturer) => $this->payload($lecturer)));
    }

    public function me(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'dosen', 403, 'Hanya akun dosen yang dapat mengakses profil ini.');

        $lecturer = Lecturer::with(['user', 'department'])
            ->where('user_id', $user->id)
            ->firstOrFail();

        return response()->json($this->payload($lecturer));
    }

    public function store(Request $request)
    {
        $actor = $request->user();
        $this->authorizeAdministrator($actor);
        $departmentId = $this->resolveDepartmentId($request, $actor);

        $request->merge(['department_id' => $departmentId]);
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:8',
            'employee_number' => 'required|string|max:100|unique:lecturers,employee_number',
            'department_id' => 'required|exists:departments,id',
            'status' => ['nullable', Rule::in(['Aktif', 'Nonaktif'])],
        ]);

        $lecturer = DB::transaction(function () use ($validated) {
            $user = User::create([
                'id' => (string) Str::uuid(),
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => 'dosen',
                'department_id' => $validated['department_id'],
            ]);

            return Lecturer::create([
                'user_id' => $user->id,
                'department_id' => $validated['department_id'],
                'employee_number' => $validated['employee_number'],
                'status' => $validated['status'] ?? 'Aktif',
            ]);
        });

        return response()->json($this->payload($lecturer->load(['user', 'department'])), 201);
    }

    public function show(Request $request, Lecturer $lecturer)
    {
        $this->authorizeLecturerAccess($request->user(), $lecturer);
        return response()->json($this->payload($lecturer->load(['user', 'department'])));
    }

    public function update(Request $request, Lecturer $lecturer)
    {
        $actor = $request->user();
        $this->authorizeLecturerAccess($actor, $lecturer, true);
        $departmentId = $this->resolveDepartmentId($request, $actor, $lecturer->department_id);

        $request->merge(['department_id' => $departmentId]);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($lecturer->user_id)],
            'password' => 'nullable|string|min:8',
            'employee_number' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('lecturers', 'employee_number')->ignore($lecturer->id)],
            'department_id' => 'required|exists:departments,id',
            'status' => ['sometimes', 'required', Rule::in(['Aktif', 'Nonaktif'])],
        ]);

        DB::transaction(function () use ($validated, $lecturer) {
            $userUpdates = collect($validated)->only(['name', 'email', 'department_id'])->all();
            if (!empty($validated['password'])) {
                $userUpdates['password'] = Hash::make($validated['password']);
            }
            if ($userUpdates) {
                $lecturer->user()->update($userUpdates);
            }

            $lecturer->update(collect($validated)
                ->only(['employee_number', 'department_id', 'status'])
                ->all());
        });

        return response()->json($this->payload($lecturer->fresh(['user', 'department'])));
    }

    public function destroy(Request $request, Lecturer $lecturer)
    {
        $this->authorizeLecturerAccess($request->user(), $lecturer, true);
        $guard = app(\App\Services\DeletionGuard::class);
        $guard->abortIfUsed(
            'Dosen '.($lecturer->user?->name ?? $lecturer->employee_number),
            $guard->lecturerUsage($lecturer->id),
            'Ubah status dosen menjadi Nonaktif, atau hapus penugasannya terlebih dahulu.'
        );

        DB::transaction(function () use ($lecturer) {
            $user = $lecturer->user;
            $lecturer->delete();
            $user?->delete();
        });

        return response()->json(null, 204);
    }

    private function authorizeAdministrator(?User $user): void
    {
        abort_unless($user && in_array($user->role, ['super_admin', 'admin_jurusan'], true), 403, 'Unauthorized');
        if ($user->role === 'admin_jurusan') {
            abort_unless($user->department_id, 403, 'Admin belum terhubung ke jurusan.');
        }
    }

    private function authorizeLecturerAccess(?User $user, Lecturer $lecturer, bool $administratorOnly = false): void
    {
        abort_unless($user, 403, 'Unauthorized');

        if (!$administratorOnly && $user->role === 'dosen' && $lecturer->user_id === $user->id) {
            return;
        }

        $this->authorizeAdministrator($user);
        if ($user->role === 'admin_jurusan') {
            abort_unless($lecturer->department_id === $user->department_id, 403, 'Dosen tidak berada pada jurusan Anda.');
        }
    }

    private function resolveDepartmentId(Request $request, User $user, ?string $fallback = null): ?string
    {
        if ($user->role === 'admin_jurusan') {
            return $user->department_id;
        }

        return $request->input('departmentId', $request->input('department_id', $fallback));
    }

    private function payload(Lecturer $lecturer): array
    {
        return [
            'id' => $lecturer->id,
            'userId' => $lecturer->user_id,
            'name' => $lecturer->user?->name,
            'email' => $lecturer->user?->email,
            'role' => $lecturer->user?->role,
            'employeeNumber' => $lecturer->employee_number,
            'status' => $lecturer->status,
            'departmentId' => $lecturer->department_id,
            'departmentName' => $lecturer->department?->name,
            'departmentCode' => $lecturer->department?->code,
            'createdAt' => $lecturer->created_at,
            'updatedAt' => $lecturer->updated_at,
        ];
    }
}
