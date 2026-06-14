<?php

namespace App\Http\Controllers;

use App\Services\MetricsService;

class InsightsController extends Controller
{
    /** GET /api/insights/summary — métricas de conta (IG + FB) em tempo real. */
    public function summary(MetricsService $metrics)
    {
        try {
            return response()->json($metrics->accountSummary());
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'error' => 'Não foi possível obter as métricas agora.'], 200);
        }
    }
}
