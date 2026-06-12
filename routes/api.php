<?php

use App\Http\Controllers\FlyerController;
use App\Http\Controllers\ProposalController;
use App\Http\Controllers\NewsSourceController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ScheduledPostController;
use App\Http\Controllers\SocialAccountController;
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
    
    Route::apiResource('scheduled-posts', ScheduledPostController::class);
    Route::get('/social-accounts', [SocialAccountController::class, 'index']);
    Route::delete('/social-accounts/{platform}', [SocialAccountController::class, 'destroy']);
    Route::post('/social-accounts/{platform}/connect', [SocialAccountController::class, 'connect']);
    Route::get('/social-accounts/{platform}/callback', [SocialAccountController::class, 'callback'])->name('social.callback');
});
