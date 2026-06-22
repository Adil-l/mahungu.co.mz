<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    // NOTA: 'is_admin' é DELIBERADAMENTE omitido do $fillable — não pode ser
    // atribuído em massa (ex.: via /api/user/profile). Define-se explicitamente
    // apenas no AdminController (atrás do middleware 'admin'), nunca por request.
    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'avatar_url',
        'api_key',
        'monitoring_interval',
        'theme',
        'settings',
    ];

    protected $casts = [
        'is_admin' => 'boolean',
        'settings' => 'json',
        'email_verified_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'api_key',
    ];
}
