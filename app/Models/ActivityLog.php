<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class ActivityLog extends Model
{
    protected $fillable = [
        'user_id', 'user_name', 'user_email', 'action', 'description', 'ip',
    ];

    /**
     * Regista uma atividade. Captura automaticamente o utilizador autenticado
     * (se houver) e o IP do pedido. Nunca lança — falhar a registar um log
     * não deve quebrar a ação principal.
     */
    public static function record(string $action, ?string $description = null, ?User $user = null): void
    {
        try {
            $user = $user ?? Auth::user();
            static::create([
                'user_id' => $user?->id,
                'user_name' => $user?->name,
                'user_email' => $user?->email,
                'action' => $action,
                'description' => $description,
                'ip' => request()->ip(),
            ]);
        } catch (\Throwable $e) {
            // silencioso — log é secundário
        }
    }
}
