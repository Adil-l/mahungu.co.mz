<?php

namespace App\Http\Controllers;

use App\Services\MetricsService;
use Illuminate\Http\Request;

class InstagramSourceController extends Controller
{
    /** GET /api/instagram/discover?username=X — posts recentes de uma conta IG pública (fonte). */
    public function discover(Request $request, MetricsService $metrics)
    {
        try {
            return response()->json($metrics->businessDiscovery((string) $request->query('username', '')));
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'error' => 'Falha ao consultar o Instagram.'], 200);
        }
    }
}
