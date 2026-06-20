<?php

namespace App\Http\Controllers;

use App\Models\ScheduledPost;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ScheduledPostController extends Controller
{
    public function index(Request $request)
    {
        $query = ScheduledPost::with(['flyer', 'metrics'])
            ->where('user_id', Auth::id());

        // Filtro opcional por status (?status=pending)
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return $query->orderBy('scheduled_at', 'desc')
            ->paginate($request->input('per_page', 20));
    }

    /**
     * Contagens por estado do utilizador autenticado, calculadas no servidor
     * (SQL GROUP BY) — exatas mesmo com milhares de posts, ao contrário de
     * contar a 1ª página da lista (que está limitada a 20).
     */
    public function stats()
    {
        $byStatus = ScheduledPost::where('user_id', Auth::id())
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $g = fn (string $s) => (int) ($byStatus[$s] ?? 0);

        // Agrupado como no Dashboard, para os números baterem em todo o lado.
        return response()->json([
            'pending'   => $g('pending') + $g('processing'),
            'posted'    => $g('posted'),
            'failed'    => $g('failed') + $g('partially_posted'),
            'total'     => (int) $byStatus->sum(),
            'by_status' => $byStatus,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'flyer_id' => 'nullable|exists:flyers,id',
            'content' => 'required_without:flyer_id|string|nullable',
            'platforms' => 'required|array|min:1',
            'platforms.*' => 'string|in:instagram,facebook,tiktok,twitter,threads',
            'scheduled_at' => 'required|date|after:now',
            'media_path' => 'nullable|string',
            'media_data_url' => 'nullable|string', // imagem do flyer (data URL base64)
            'media_type' => 'nullable|in:feed,story,carousel',
            'carousel_data_urls' => 'nullable|array', // slides extra (data URLs base64) p/ carrossel
            'carousel_data_urls.*' => 'string',
            'metadata' => 'nullable|array',
        ]);

        // Guarda a imagem do flyer no servidor para a publicação automática.
        // Aceita base64 (data URL) OU um URL http(s) de imagem (alguns flyers
        // guardam a foto como URL em vez do base64 composto) — assim o Instagram
        // não falha "exige imagem" só porque o formato da fonte é um URL.
        $mediaPath = $validated['media_path'] ?? null;
        if (!empty($validated['media_data_url'])) {
            $mediaPath = $this->storeImageSource($validated['media_data_url']) ?? $mediaPath;
        }

        // Carrossel: guarda os slides extra (slide 1 = media_path; 2..N = carousel_paths).
        $carouselPaths = [];
        foreach (($validated['carousel_data_urls'] ?? []) as $du) {
            $p = $this->storeDataUrl($du);
            if ($p) {
                $carouselPaths[] = $p;
            }
        }

        // O Instagram exige SEMPRE uma imagem (feed/story/carrossel). Recusa cedo
        // com erro claro em vez de deixar o job de publicação falhar mais tarde.
        if (in_array('instagram', $validated['platforms'], true) && empty($mediaPath)) {
            $temFonte = ! empty($validated['media_data_url']) || ! empty($validated['media_path']);
            $msg = $temFonte
                ? 'A imagem deste flyer não pôde ser usada. Reabre o flyer no editor e guarda-o de novo (para gerar a imagem), depois agenda.'
                : 'O Instagram exige uma imagem. Escolhe um flyer antes de agendar para o Instagram.';

            return response()->json([
                'message' => $msg,
                'errors' => ['media' => [$msg]],
            ], 422);
        }

        $post = ScheduledPost::create([
            'user_id' => Auth::id(),
            'flyer_id' => $validated['flyer_id'] ?? null,
            'content' => $validated['content'] ?? null,
            'platforms' => $validated['platforms'],
            'scheduled_at' => $validated['scheduled_at'],
            'media_path' => $mediaPath,
            'media_type' => $validated['media_type'] ?? 'feed',
            'carousel_paths' => $carouselPaths ?: null,
            'metadata' => $validated['metadata'] ?? null,
            'status' => 'pending',
        ]);

        return response()->json($post, 201);
    }

    /**
     * Descodifica um data URL (data:image/png;base64,...) e guarda-o no disco
     * público, devolvendo o caminho relativo (ou null se inválido).
     *
     * Usa o disco 'public' (storage/app/public, exposto via /storage) porque o
     * Instagram exige um URL público da imagem para publicar.
     */
    private function storeDataUrl(string $dataUrl): ?string
    {
        if (!preg_match('/^data:image\/(\w+);base64,/', $dataUrl, $m)) {
            return null;
        }
        $ext = strtolower($m[1]) === 'jpeg' ? 'jpg' : strtolower($m[1]);
        $bytes = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
        if ($bytes === false) {
            return null;
        }
        return $this->putBytes($bytes, $ext);
    }

    /**
     * Resolve a fonte da imagem do flyer: base64 (data URL) OU URL http(s).
     * (Alguns flyers guardam a foto como URL em vez do base64 composto.)
     */
    private function storeImageSource(string $src): ?string
    {
        if (str_starts_with($src, 'data:image/')) {
            return $this->storeDataUrl($src);
        }
        if (preg_match('#^https?://#i', $src)) {
            return $this->storeRemoteImage($src);
        }

        return null;
    }

    /**
     * Descarrega uma imagem de um URL http(s) PÚBLICO e guarda-a no disco.
     * Guarda anti-SSRF: só http/https que resolvam para IP público; só
     * content-type image/*; tamanho limitado a 8 MB. Devolve o caminho ou null.
     */
    private function storeRemoteImage(string $url): ?string
    {
        if (! $this->isPublicHttpUrl($url)) {
            return null;
        }
        try {
            $res = Http::timeout(15)->get($url);
        } catch (\Throwable $e) {
            return null;
        }
        if (! $res->successful()) {
            return null;
        }
        $ct = strtolower((string) $res->header('Content-Type'));
        if (! str_starts_with($ct, 'image/')) {
            return null;
        }
        $bytes = $res->body();
        $len = strlen($bytes);
        if ($len === 0 || $len > 8 * 1024 * 1024) {
            return null;
        }
        $ext = match (true) {
            str_contains($ct, 'png') => 'png',
            str_contains($ct, 'webp') => 'webp',
            str_contains($ct, 'gif') => 'gif',
            default => 'jpg',
        };

        return $this->putBytes($bytes, $ext);
    }

    /** Grava bytes no disco de media e devolve o caminho relativo. */
    private function putBytes(string $bytes, string $ext): string
    {
        $path = 'scheduled/' . Str::uuid() . '.' . $ext;
        // Visibilidade configurável: 'public' para o S3 servir um URL acessível
        // (Instagram/Threads). Se o bucket não permitir ACLs, MEDIA_VISIBILITY vazio.
        $disk = Storage::disk(config('filesystems.media_disk'));
        $visibility = config('filesystems.media_visibility');
        $visibility ? $disk->put($path, $bytes, $visibility) : $disk->put($path, $bytes);

        return $path;
    }

    /** Só http/https que resolva exclusivamente para IP(s) público(s) — anti-SSRF. */
    private function isPublicHttpUrl(string $url): bool
    {
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = $parts['host'] ?? '';
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return false;
        }
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (@gethostbynamel($host) ?: []);
        if (empty($ips)) {
            return false;
        }
        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return false;
            }
        }

        return true;
    }

    public function show(ScheduledPost $scheduledPost)
    {
        if ($scheduledPost->user_id !== Auth::id()) {
            abort(403);
        }
        return $scheduledPost->load('flyer');
    }

    public function update(Request $request, ScheduledPost $scheduledPost)
    {
        if ($scheduledPost->user_id !== Auth::id()) {
            abort(403);
        }

        // Posts já processados (posted/failed/partially_posted) não podem ser editados
        if ($scheduledPost->isLocked()) {
            return response()->json([
                'message' => 'Este agendamento já foi processado e não pode ser editado.'
            ], 422);
        }

        $validated = $request->validate([
            'content' => 'nullable|string',
            'platforms' => 'nullable|array|min:1',
            'platforms.*' => 'string|in:instagram,facebook,tiktok,twitter,threads',
            'scheduled_at' => 'nullable|date|after:now',
            'media_path' => 'nullable|string',
        ]);
        // 'status' removido: o status só deve ser alterado pelo Job/Comando, nunca pelo usuário

        // Não permitir ficar com o Instagram nas plataformas sem imagem.
        $platforms = $validated['platforms'] ?? $scheduledPost->platforms ?? [];
        $mediaPath = $validated['media_path'] ?? $scheduledPost->media_path;
        if (in_array('instagram', $platforms, true) && empty($mediaPath)) {
            return response()->json([
                'message' => 'O Instagram exige uma imagem. Não é possível agendar para o Instagram sem imagem.',
                'errors' => ['media' => ['O Instagram exige uma imagem para publicar.']],
            ], 422);
        }

        $scheduledPost->update($validated);

        return $scheduledPost;
    }

    public function destroy(ScheduledPost $scheduledPost)
    {
        if ($scheduledPost->user_id !== Auth::id()) {
            abort(403);
        }
        $scheduledPost->delete();
        return response()->json(null, 204);
    }

    /**
     * Cria um Story do Instagram a partir da imagem de um post já agendado/publicado
     * (reutiliza o mesmo ficheiro de media) e publica-o de imediato.
     */
    public function shareStory(ScheduledPost $scheduledPost)
    {
        if ($scheduledPost->user_id !== Auth::id()) {
            abort(403);
        }
        if (!$scheduledPost->media_path) {
            return response()->json(['message' => 'Este post não tem imagem para partilhar como Story.'], 422);
        }

        $story = ScheduledPost::create([
            'user_id' => Auth::id(),
            'flyer_id' => $scheduledPost->flyer_id,
            'content' => '', // Stories não levam legenda
            'platforms' => ['instagram'],
            'media_path' => $scheduledPost->media_path, // reutiliza a mesma imagem (mesmo ficheiro no disco)
            'media_type' => 'story',
            'scheduled_at' => now(),
            'metadata' => [
                'story_of' => $scheduledPost->id,
                'flyer_title' => $scheduledPost->metadata['flyer_title'] ?? null,
            ],
            'status' => 'pending',
        ]);

        // Publica já (sync em produção → inline; senão o agendador apanha no próximo minuto).
        \App\Jobs\PostToSocialMedia::dispatch($story);

        return response()->json(['ok' => true, 'id' => $story->id, 'status' => $story->fresh()->status]);
    }

    /**
     * Reagenda um post que falhou ou foi parcialmente postado, voltando-o para 'pending'.
     */
    public function retry(Request $request, ScheduledPost $scheduledPost)
    {
        if ($scheduledPost->user_id !== Auth::id()) {
            abort(403);
        }

        if (!in_array($scheduledPost->status, ['failed', 'partially_posted'], true)) {
            return response()->json([
                'message' => 'Apenas posts com falha podem ser reenviados.'
            ], 422);
        }

        $validated = $request->validate([
            'scheduled_at' => 'nullable|date|after:now',
        ]);

        $scheduledPost->update([
            'status' => 'pending',
            'scheduled_at' => $validated['scheduled_at'] ?? now(),
            'error_message' => null,
        ]);

        return $scheduledPost;
    }
}
