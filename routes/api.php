<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AiController;
use App\Http\Controllers\FlyerController;
use App\Http\Controllers\HashtagController;
use App\Http\Controllers\ImageSearchController;
use App\Http\Controllers\InsightsController;
use App\Http\Controllers\InstagramSourceController;
use App\Http\Controllers\ProposalController;
use App\Http\Controllers\NewsSourceController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ScheduledPostController;
use App\Http\Controllers\SocialAccountController;
use App\Http\Controllers\SyncController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

Route::middleware(['auth'])->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });
    
    Route::put('/user/profile', [UserController::class, 'updateProfile']);
    Route::put('/user/password', [UserController::class, 'updatePassword']);

    Route::apiResource('flyers', FlyerController::class);
    Route::apiResource('proposals', ProposalController::class);
    Route::post('/proposals/clear', [ProposalController::class, 'clear']);
    Route::apiResource('sources', NewsSourceController::class);

    // Geração de texto editorial por IA (proxy Claude — chave no servidor).
    Route::post('/ai/generate', [AiController::class, 'generate']);

    // Gerador de hashtags (proxy RapidAPI/Hashtagy).
    Route::get('/hashtags', [HashtagController::class, 'generate']);

    // Pesquisa de imagens de reforço (proxy Pexels/Unsplash — chaves no servidor).
    Route::get('/images/search', [ImageSearchController::class, 'search']);

    // Store partilhado entre utilizadores (Salvados/Aprovados visíveis por todos).
    Route::get('/sync/{kind}', [SyncController::class, 'index']);
    Route::post('/sync/{kind}', [SyncController::class, 'store']);
    Route::delete('/sync/{kind}/{clientId}', [SyncController::class, 'destroy']);

    Route::apiResource('scheduled-posts', ScheduledPostController::class);
    // Partilhar a imagem de um post (agendado/publicado) como Story do Instagram.
    Route::post('/scheduled-posts/{scheduledPost}/share-story', [ScheduledPostController::class, 'shareStory']);

    // Métricas/insights reais (IG + Página FB) via token de Sistema.
    Route::get('/insights/summary', [InsightsController::class, 'summary']);

    // Fontes do Instagram (Business Discovery de contas business/creator públicas).
    Route::get('/instagram/discover', [InstagramSourceController::class, 'discover']);

    Route::get('/social-accounts', [SocialAccountController::class, 'index']);
    Route::delete('/social-accounts/{platform}', [SocialAccountController::class, 'destroy']);
    Route::post('/social-accounts/{platform}/connect', [SocialAccountController::class, 'connect']);
    Route::get('/social-accounts/{platform}/callback', [SocialAccountController::class, 'callback'])->name('social.callback');

    // ── Administração (apenas admin): gestão de utilizadores + logs ──
    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('/users', [AdminController::class, 'users']);
        Route::post('/users', [AdminController::class, 'storeUser']);
        Route::delete('/users/{user}', [AdminController::class, 'destroyUser']);
        Route::get('/logs', [AdminController::class, 'logs']);
    });
});
