<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to the "home" route for your application.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/dashboard';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();

        $this->routes(function () {
            // Servimos a API através do grupo 'web' (sessão + CSRF + cookies),
            // já que o SPA é da mesma origem e autentica por sessão. Evita o
            // fluxo "stateful" do Sanctum (cuja config aqui aponta para
            // middleware inexistente) e usa o mesmo mecanismo do login.
            // 'throttle:api' aplica o rate limiter definido abaixo (60/min) — sem
            // isto, como carregamos a API no grupo 'web' (que não tem throttle),
            // os endpoints ficavam SEM limite (risco de cost-DoS no /api/ai/*).
            Route::middleware(['web', 'throttle:api'])
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }

    /**
     * Configure the rate limiters for the application.
     */
    protected function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

        // Endpoints caros que fazem proxy ao Claude (cada chamada gasta créditos):
        // limite apertado por utilizador para travar esgotamento de custos/faturação.
        RateLimiter::for('ai', function (Request $request) {
            return Limit::perMinute(15)->by($request->user()?->id ?: $request->ip());
        });
    }
}
