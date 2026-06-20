<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Sugestões de agendamento para uma página de notícias (social-media-manager).
 * Lógica pura (sem IA): horários ótimos no fuso de Moçambique + cadência
 * recomendada. O frontend usa isto para sugerir "faz N posts hoje a estas horas".
 */
class SchedulingController extends Controller
{
    private const TZ = 'Africa/Maputo'; // UTC+2

    /**
     * Grelha diária de horários (picos de MZ: manhã, almoço, tarde, noite).
     * ~11 slots/dia → confortável para uma página de notícias (10+/dia).
     */
    private const DAILY_SLOTS = [
        '06:45', '08:00', '10:00', '12:00', '13:00', '15:00',
        '17:00', '18:30', '19:30', '20:30', '21:00',
    ];

    public function suggestions(Request $request): JsonResponse
    {
        $count = (int) $request->query('count', 8);
        $count = max(1, min($count, 30));

        $tz = new DateTimeZone(self::TZ);
        $now = Carbon::now($tz);

        // Próximos $count horários futuros, varrendo até 5 dias.
        $slots = [];
        for ($day = 0; $day < 5 && count($slots) < $count; $day++) {
            $base = $now->copy()->addDays($day);
            foreach (self::DAILY_SLOTS as $hm) {
                [$h, $m] = array_map('intval', explode(':', $hm));
                $slot = $base->copy()->setTime($h, $m, 0);
                if ($slot->greaterThan($now)) {
                    $slots[] = $slot->toIso8601String();
                    if (count($slots) >= $count) {
                        break;
                    }
                }
            }
        }

        return response()->json([
            'timezone' => self::TZ,
            'recommended_per_day' => [
                'min' => 8,
                'ideal' => 12,
                'max' => 16,
                'note' => 'Página de notícias: ritmo alto. 10–12 posts/dia é saudável; em dias de notícia forte podes passar disso.',
            ],
            'peak_windows' => [
                ['label' => 'Manhã', 'start' => '06:30', 'end' => '08:30'],
                ['label' => 'Almoço', 'start' => '12:00', 'end' => '13:30'],
                ['label' => 'Tarde', 'start' => '15:00', 'end' => '17:30'],
                ['label' => 'Noite', 'start' => '18:30', 'end' => '21:00'],
            ],
            'daily_slots' => self::DAILY_SLOTS,
            'next_slots' => $slots,
        ]);
    }
}
