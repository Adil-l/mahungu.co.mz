<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\SharedItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SyncController extends Controller
{
    private const KINDS = ['proposal', 'flyer'];

    /** Lista todos os itens partilhados de um tipo (proposal|flyer). */
    public function index(Request $request, string $kind)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        // Assinatura barata (count + max updated_at) — SEM ler os payloads (imagens).
        // Permite responder 304 quando nada mudou, evitando re-descarregar dezenas de
        // GB de imagens base64 a cada poll do frontend (principal custo de bandwidth).
        $sig = SharedItem::where('kind', $kind)
            ->selectRaw('count(*) as c, max(updated_at) as m')->first();
        $etag = '"' . md5($kind . ':' . ($sig->c ?? 0) . ':' . ($sig->m ?? '')) . '"';

        if (trim($request->header('If-None-Match', '')) === $etag) {
            return response('', 304, ['ETag' => $etag]);
        }

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
            'ETag' => $etag,
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

        // Descarrega imagens base64 dos flyers para o object storage (R2) — só em
        // produção. Em vez de guardar MBs de base64 na BD (caro a transferir a cada
        // sync), guarda o URL público. O frontend já renderiza http e data:image.
        $payload = $this->offloadImages($kind, (string) $data['client_id'], $data['payload']);

        $item = SharedItem::updateOrCreate(
            ['kind' => $kind, 'client_id' => (string) $data['client_id']],
            ['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE)]
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

    /**
     * Converte imagens base64 de um flyer em ficheiros no object storage (R2),
     * substituindo o campo pelo URL público. Só ativa quando o media_disk é S3/R2
     * (produção); local fica em base64. Qualquer falha mantém o base64 original
     * (nunca parte a partilha).
     */
    private function offloadImages(string $kind, string $clientId, array $payload): array
    {
        if ($kind !== 'flyer') {
            return $payload;
        }
        $diskName = config('filesystems.media_disk');
        if (config("filesystems.disks.{$diskName}.driver") !== 's3') {
            return $payload; // só em produção (R2/S3); evita partir o local
        }

        $disk = Storage::disk($diskName);
        $visibility = config('filesystems.media_visibility');

        foreach (['image', 'background_image'] as $key) {
            $val = $payload[$key] ?? null;
            if (! is_string($val) || ! preg_match('#^data:image/(\w+);base64,#', $val, $m)) {
                continue;
            }
            try {
                $bytes = base64_decode(substr($val, strpos($val, ',') + 1), true);
                if ($bytes === false) {
                    continue;
                }
                $ext = strtolower($m[1]) === 'jpeg' ? 'jpg' : strtolower($m[1]);
                // Hash no nome → muda quando a imagem muda (evita cache obsoleta).
                $path = "shared/flyers/{$clientId}-{$key}-" . substr(md5($bytes), 0, 10) . ".{$ext}";
                $visibility ? $disk->put($path, $bytes, $visibility) : $disk->put($path, $bytes);
                $payload[$key] = $disk->url($path);
            } catch (\Throwable $e) {
                // mantém o base64 original
            }
        }

        return $payload;
    }

    /** Remove um item partilhado. */
    public function destroy(string $kind, string $clientId)
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        SharedItem::where('kind', $kind)->where('client_id', $clientId)->delete();

        return response()->noContent();
    }
}
