<?php

namespace App\Http\Controllers;

use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DepartmentController extends Controller
{
    public function reportSettings(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'admin_jurusan' && $user->department_id, 403, 'Unauthorized');

        $department = Department::findOrFail($user->department_id);

        return response()->json([
            'headName' => $department->head_name,
            'headNip' => $department->head_nip,
            'signatureData' => $department->signature_data,
        ]);
    }

    public function updateReportSettings(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'admin_jurusan' && $user->department_id, 403, 'Unauthorized');

        $validated = $request->validate([
            'headName' => 'required|string|max:255',
            'headNip' => 'required|string|max:100',
            'signatureData' => 'nullable|string|max:3000000',
        ]);

        if (!empty($validated['signatureData']) && !preg_match('/^data:image\/(png|jpe?g);base64,/', $validated['signatureData'])) {
            return response()->json(['message' => 'Format tanda tangan harus berupa PNG atau JPG.'], 422);
        }

        $department = Department::findOrFail($user->department_id);
        $department->update([
            'head_name' => $validated['headName'],
            'head_nip' => $validated['headNip'],
            'signature_data' => $validated['signatureData'] ?? null,
        ]);

        return $this->reportSettings($request);
    }

    public function index()
    {
        return response()->json(Department::all());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:departments',
        ]);

        $validated['id'] = (string) Str::uuid();

        $department = Department::create($validated);
        return response()->json($department, 201);
    }

    public function show(string $id)
    {
        $department = Department::findOrFail($id);
        return response()->json($department);
    }

    public function update(Request $request, string $id)
    {
        $department = Department::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'code' => 'sometimes|required|string|max:50|unique:departments,code,' . $department->id,
        ]);

        $department->update($validated);
        return response()->json($department);
    }

    public function destroy(string $id)
    {
        $department = Department::findOrFail($id);
        $department->delete();
        return response()->json(null, 204);
    }
}
