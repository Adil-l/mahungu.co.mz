<?php

namespace App\Http\Controllers;

use App\Models\SharedItem;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    private const KINDS = ['proposal', 'flyer'];

    /** Lista todos os itens partilhados de um tipo (proposal|flyer). */
    public function index(string $kind)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        // Devolve só os payloads (objetos do cliente).
        return SharedItem::where('kind', $kind)
            ->get()
            ->map(fn ($item) => json_decode($item->payload, true))
            ->filter()
            ->values();
    }

    /** Cria ou atualiza um item partilhado (upsert por client_id). */
    public function store(Request $request, string $kind)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        $data = $request->validate([
            'client_id' => ['required'],
            'payload' => ['required', 'array'],
        ]);

        SharedItem::updateOrCreate(
            ['kind' => $kind, 'client_id' => (string) $data['client_id']],
            ['payload' => json_encode($data['payload'], JSON_UNESCAPED_UNICODE)]
        );

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
