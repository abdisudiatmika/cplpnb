<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private function appendDepartmentInfo($user)
    {
        if ($user && $user->department) {
            $user->departmentName = $user->department->name;
            $user->departmentCode = $user->department->code;
        }
        if ($user && $user->lecturer) {
            $user->lecturerId = $user->lecturer->id;
            $user->employeeNumber = $user->lecturer->employee_number;
            $user->lecturerStatus = $user->lecturer->status;
        }
        return $user;
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if (Auth::attempt($request->only('email', 'password'))) {
            $user = Auth::user()->load(['department', 'lecturer']);
            if ($user->role === 'dosen' && (!$user->lecturer || $user->lecturer->status !== 'Aktif')) {
                Auth::guard('web')->logout();
                if ($request->hasSession()) {
                    $request->session()->invalidate();
                    $request->session()->regenerateToken();
                }

                throw ValidationException::withMessages([
                    'email' => ['Akun dosen tidak aktif. Hubungi admin jurusan.'],
                ]);
            }

            if ($request->hasSession()) {
                $request->session()->regenerate();
            }

            return response()->json([
                'user' => $this->appendDepartmentInfo($user)
            ]);
        }

        throw ValidationException::withMessages([
            'email' => ['Kredensial yang diberikan tidak cocok dengan data kami.'],
        ]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function changePassword(Request $request)
    {
        $validated = $request->validate([
            'currentPassword' => 'required|string',
            'password' => 'required|string|min:10|max:255|confirmed|different:currentPassword',
        ], [
            'password.min' => 'Kata sandi baru minimal 10 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi baru tidak sama.',
            'password.different' => 'Kata sandi baru harus berbeda dari kata sandi lama.',
        ]);

        $user = $request->user();
        if (! Hash::check($validated['currentPassword'], $user->password)) {
            throw ValidationException::withMessages(['currentPassword' => ['Kata sandi lama tidak sesuai.']]);
        }

        $user->password = Hash::make($validated['password']);
        $user->save();

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json(['message' => 'Kata sandi berhasil diganti.']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load(['department', 'lecturer']);
        return response()->json([
            'user' => $this->appendDepartmentInfo($user)
        ]);
    }

    // Register is optional depending on requirements, but here is a simple one
    public function getAdmins(Request $request)
    {
        $admins = User::with('department')->orderBy('created_at', 'desc')->get()->map(function ($admin) {
            return $this->appendDepartmentInfo($admin);
        });
        return response()->json($admins);
    }

    public function createAdmin(Request $request)
    {
        $departmentId = $request->input('departmentId', $request->input('department_id'));

        $request->merge(['department_id' => $departmentId]);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
            'department_id' => 'required|exists:departments,id'
        ]);

        $user = User::create([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => 'admin_jurusan',
            'department_id' => $departmentId,
        ]);

        return response()->json($this->appendDepartmentInfo($user->load('department')), 201);
    }

    public function updateAdmin(Request $request, string $id)
    {
        $user = User::where('role', 'admin_jurusan')->findOrFail($id);
        
        $departmentId = $request->input('departmentId', $request->input('department_id'));
        if ($departmentId !== null) {
            $request->merge(['department_id' => $departmentId]);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|string|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8',
            'department_id' => 'sometimes|required|exists:departments,id'
        ]);

        if ($request->filled('name')) $user->name = $request->name;
        if ($request->filled('email')) $user->email = $request->email;
        if ($request->filled('password')) $user->password = Hash::make($request->password);
        if ($request->has('departmentId') || $request->has('department_id')) {
            $user->department_id = $departmentId;
        }

        $user->save();

        return response()->json($this->appendDepartmentInfo($user->load('department')));
    }

    public function deleteAdmin(string $id)
    {
        $user = User::where('role', 'admin_jurusan')->findOrFail($id);
        $user->delete();
        return response()->json(null, 204);
    }
}
