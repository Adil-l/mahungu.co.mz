<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

class PasswordResetLinkController extends Controller
{
    /**
     * Handle an incoming password reset link request.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        // Tenta enviar o link, mas NÃO revela se o email existe (anti-enumeração):
        // devolvemos sempre a mesma mensagem genérica, qualquer que seja o estado.
        Password::sendResetLink($request->only('email'));

        return response()->json([
            'status' => 'Se existir uma conta com esse email, enviámos um link de recuperação.',
        ]);
    }
}
