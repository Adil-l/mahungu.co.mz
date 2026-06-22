<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AdminController extends Controller
{
    /** Lista todos os utilizadores (mais recentes primeiro). */
    public function users()
    {
        return User::query()
            ->orderByDesc('created_at')
            ->get(['id', 'name', 'email', 'phone', 'is_admin', 'created_at']);
    }

    /** Cria um novo utilizador (apenas admin). */
    public function storeUser(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:40'],
            'is_admin' => ['boolean'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'password' => Hash::make($data['password']),
            'email_verified_at' => now(),
            'theme' => 'dark',
            'monitoring_interval' => 15,
        ]);
        // 'is_admin' não é mass-assignable (ver User::$fillable): define-se aqui,
        // explicitamente, já dentro da zona protegida pelo middleware 'admin'.
        $user->is_admin = (bool) ($data['is_admin'] ?? false);
        $user->save();

        ActivityLog::record('user.created', "Criou o utilizador {$user->email}");

        return response()->json($user->only(['id', 'name', 'email', 'phone', 'is_admin', 'created_at']), 201);
    }

    /** Remove um utilizador (não permite apagar a própria conta nem o último admin). */
    public function destroyUser(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'Não pode apagar a sua própria conta.'], 422);
        }

        if ($user->is_admin && User::where('is_admin', true)->count() <= 1) {
            return response()->json(['message' => 'Não pode apagar o último administrador.'], 422);
        }

        $email = $user->email;
        $user->delete();

        ActivityLog::record('user.deleted', "Removeu o utilizador {$email}");

        return response()->noContent();
    }

    /** Lista os registos de atividade (mais recentes primeiro, paginado). */
    public function logs(Request $request)
    {
        $query = ActivityLog::query()->orderByDesc('created_at');

        if ($action = $request->query('action')) {
            $query->where('action', $action);
        }

        return $query->limit(300)->get();
    }
}
