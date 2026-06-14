<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\SharedItem;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    private const KINDS = ['proposal', 'flyer'];

    /** Lista todos os itens partilhados de um tipo (proposal|flyer). */
    public function index(string $kind)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        // Os payloads já são JSON válido (guardados via json_encode). Streamamos
        // a concatenação direta SEM os descodificar/recodificar todos para
        // memória — caso contrário, com imagens grandes, esgota a RAM (erros 500).
        // lazy() lê em lotes, mantendo a memória baixa mesmo com muitos itens.
        return response()->stream(function () use ($kind) {
            echo '[';
            $first = true;
            SharedItem::where('kind', $kind)
                ->select('id', 'payload')
                ->lazy(50)
                ->each(function ($item) use (&$first) {
                    $p = $item->payload;
                    if ($p === null || $p === '' || $p === 'null') {
                        return;
                    }
                    echo $first ? '' : ',';
                    echo $p;
                    $first = false;
                });
            echo ']';
        }, 200, [
            'Content-Type' => 'application/json',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /** Cria ou atualiza um item partilhado (upsert por client_id). */
    public function store(Request $request, string $kind)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        $data = $request->validate([
            'client_id' => ['required'],
            'payload' => ['required', 'array'],
        ]);

        $item = SharedItem::updateOrCreate(
            ['kind' => $kind, 'client_id' => (string) $data['client_id']],
            ['payload' => json_encode($data['payload'], JSON_UNESCAPED_UNICODE)]
        );

        // Regista só quando o item é criado pela 1ª vez (evita ruído nas atualizações).
        if ($item->wasRecentlyCreated) {
            $title = $data['payload']['title'] ?? $data['payload']['generatedTitle'] ?? 'sem título';
            if ($kind === 'flyer') {
                ActivityLog::record('flyer.shared', "Aprovou o post: {$title}");
            } else {
                ActivityLog::record('proposal.shared', "Salvou a proposta: {$title}");
            }
        }

        return response()->json(['ok' => true]);
    }

    /** Remove um item partilhado. */
    public function destroy(string $kind, string $clientId)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        SharedItem::where('kind', $kind)->where('client_id', $clientId)->delete();

        return response()->noContent();
    }
}
