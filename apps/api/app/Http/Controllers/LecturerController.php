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

        // Dosen adalah data bersama lintas prodi: semua admin melihat seluruh dosen agar bisa
        // menugaskan dosen dari prodi lain. Pengubahan tetap dibatasi pada prodi homebase.
        $query = Lecturer::with(['user', 'department'])->orderByDesc('created_at');

        return response()->json($query->get()->map(fn (Lecturer $lecturer) => $this->payload($lecturer, $user)));
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
        $this->rejectExistingLecturer($request);
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

        return response()->json($this->payload($lecturer->load(['user', 'department']), $actor), 201);
    }

    public function show(Request $request, Lecturer $lecturer)
    {
        $this->authorizeLecturerAccess($request->user(), $lecturer, false, true);
        return response()->json($this->payload($lecturer->load(['user', 'department']), $request->user()));
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

        return response()->json($this->payload($lecturer->fresh(['user', 'department']), $actor));
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

    private function authorizeLecturerAccess(?User $user, Lecturer $lecturer, bool $administratorOnly = false, bool $readOnly = false): void
    {
        abort_unless($user, 403, 'Unauthorized');

        if (!$administratorOnly && $user->role === 'dosen' && $lecturer->user_id === $user->id) {
            return;
        }

        $this->authorizeAdministrator($user);
        if ($user->role === 'admin_jurusan' && ! $readOnly) {
            abort_unless(
                $lecturer->department_id === $user->department_id,
                403,
                'Dosen ini ber-homebase di prodi lain. Hanya admin prodi homebase atau Super Admin yang dapat mengubahnya.'
            );
        }
    }

    /**
     * Dosen tidak boleh didaftarkan dua kali. Bila NIP/NIDN atau email sudah dipakai dosen lain,
     * arahkan admin untuk memilih dosen tersebut di Penugasan Dosen.
     */
    private function rejectExistingLecturer(Request $request): void
    {
        $employeeNumber = trim((string) $request->input('employee_number'));
        $email = trim((string) $request->input('email'));
        $existing = Lecturer::with(['user', 'department'])
            ->where(function ($query) use ($employeeNumber, $email) {
                $query->when($employeeNumber !== '', fn ($q) => $q->where('employee_number', $employeeNumber))
                    ->when($email !== '', fn ($q) => $q->orWhereHas('user', fn ($user) => $user->where('email', $email)));
            })
            ->when($employeeNumber === '' && $email === '', fn ($query) => $query->whereRaw('1 = 0'))
            ->first();
        if (! $existing) {
            return;
        }

        $field = $existing->employee_number === $employeeNumber ? 'employee_number' : 'email';
        $label = $field === 'employee_number' ? 'NIP/NIDN '.$employeeNumber : 'Email '.$email;
        $homebase = $existing->department?->name ?? 'prodi lain';
        throw \Illuminate\Validation\ValidationException::withMessages([
            $field => [$label.' sudah terdaftar atas nama '.$existing->user?->name.' (homebase '.$homebase.'). Dosen tidak perlu ditambahkan lagi; pilih langsung di menu Penugasan Dosen.'],
        ]);
    }

    private function resolveDepartmentId(Request $request, User $user, ?string $fallback = null): ?string
    {
        if ($user->role === 'admin_jurusan') {
            return $user->department_id;
        }

        return $request->input('departmentId', $request->input('department_id', $fallback));
    }

    private function payload(Lecturer $lecturer, ?User $viewer = null): array
    {
        $canEdit = $viewer && ($viewer->role === 'super_admin'
            || ($viewer->role === 'admin_jurusan' && $viewer->department_id === $lecturer->department_id));

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
            'canEdit' => $canEdit,
            'createdAt' => $lecturer->created_at,
            'updatedAt' => $lecturer->updated_at,
        ];
    }
}
