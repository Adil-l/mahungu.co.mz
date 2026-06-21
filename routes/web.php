<?php

use App\Http\Controllers\FeedProxyController;
use App\Http\Controllers\MetaController;
use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
*/

// Proxy de feeds RSS (server-side, sem CORS) usado pela automação do frontend.
Route::get('/feed-proxy', FeedProxyController::class)->name('feed-proxy');

// Ecrãs de autenticação (visíveis apenas a convidados).
// NOTA: não há auto-registo — as contas são criadas pelo admin na app.
Route::middleware('guest')->group(function () {
    Route::view('/login', 'auth.login')->name('login');
    Route::view('/forgot-password', 'auth.forgot-password')->name('password.request');
    Route::get('/reset-password/{token}', function (string $token) {
        return view('auth.reset-password', [
            'token' => $token,
            'email' => request('email'),
        ]);
    })->name('password.reset');
});

// Rotas POST de autenticação (login, registo, recuperação, logout).
require __DIR__.'/auth.php';

// Páginas legais PÚBLICAS (exigidas pela App Review da Meta: têm de ser
// acessíveis sem login para os revisores/crawler). Em PT.
Route::view('/privacidade', 'legal.privacy')->name('legal.privacy');
Route::view('/termos', 'legal.terms')->name('legal.terms');
Route::get('/eliminar-dados', [MetaController::class, 'deletionStatus'])->name('meta.deletion-status');

// SPA (Mahungu Studio) — servida apenas a utilizadores autenticados.
Route::middleware('auth')->get('/{any}', SpaController::class)
    ->where('any', '^(?!api/|sanctum/|feed-proxy|login|register|forgot-password|reset-password|logout|verify-email|email/|privacidade|termos|eliminar-dados).*$');
