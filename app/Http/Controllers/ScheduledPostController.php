<?php

namespace App\Http\Controllers;

use App\Models\ScheduledPost;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ScheduledPostController extends Controller
{
    public function index(Request $request)
    {
        $query = ScheduledPost::with('flyer')
            ->where('user_id', Auth::id());

        // Filtro opcional por status (?status=pending)
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return $query->orderBy('scheduled_at', 'desc')
            ->paginate($request->input('per_page', 20));
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
            'metadata' => 'nullable|array',
        ]);

        // Guarda a imagem do flyer no servidor para a publicação automática.
        $mediaPath = $validated['media_path'] ?? null;
        if (!empty($validated['media_data_url'])) {
            $mediaPath = $this->storeDataUrl($validated['media_data_url']) ?? $mediaPath;
        }

        $post = ScheduledPost::create([
            'user_id' => Auth::id(),
            'flyer_id' => $validated['flyer_id'] ?? null,
            'content' => $validated['content'] ?? null,
            'platforms' => $validated['platforms'],
            'scheduled_at' => $validated['scheduled_at'],
            'media_path' => $mediaPath,
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
        $path = 'scheduled/' . Str::uuid() . '.' . $ext;
        Storage::disk('public')->put($path, $bytes);
        return $path;
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
