<?php

namespace App\Jobs;

use App\Models\ScheduledPost;
use App\Models\SocialAccount;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PostToSocialMedia implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = 30;

    protected $scheduledPost;

    public function __construct(ScheduledPost $scheduledPost)
    {
        $this->scheduledPost = $scheduledPost;
    }

    public function handle(): void
    {
        // Aceita 'pending' (chamado diretamente) ou 'processing' (via comando agendador)
        if (!in_array($this->scheduledPost->status, ['pending', 'processing'], true)) {
            return;
        }

        $platforms = $this->scheduledPost->platforms;
        $successCount = 0;
        $errors = [];

        foreach ($platforms as $platform) {
            try {
                $account = SocialAccount::where('user_id', $this->scheduledPost->user_id)
                    ->where('platform', $platform)
                    ->first();

                if (!$account) {
                    throw new \Exception("Conta do $platform não conectada.");
                }

                if ($account->isExpired()) {
                    throw new \Exception("Token do $platform expirado. Reconecte a conta.");
                }

                $this->postToPlatform($platform, $account);
                $successCount++;
            } catch (\Exception $e) {
                $errors[$platform] = $e->getMessage();
                Log::error("Erro ao postar no $platform: " . $e->getMessage());
            }
        }

        if ($successCount === count($platforms)) {
            $this->scheduledPost->update(['status' => 'posted', 'error_message' => null]);
        } elseif ($successCount > 0) {
            $this->scheduledPost->update([
                'status' => 'partially_posted',
                'error_message' => $errors,
            ]);
        } else {
            $this->scheduledPost->update([
                'status' => 'failed',
                'error_message' => $errors,
            ]);
        }
    }

    /**
     * Garante que, se o Job falhar de forma irrecuperável (todas as tentativas
     * esgotadas), o post não fique travado em 'processing'.
     */
    public function failed(\Throwable $exception): void
    {
        if (in_array($this->scheduledPost->status, ['pending', 'processing'], true)) {
            $this->scheduledPost->update([
                'status' => 'failed',
                'error_message' => ['exception' => $exception->getMessage()],
            ]);
        }
    }

    protected function postToPlatform($platform, $account)
    {
        $content = $this->scheduledPost->content ?? '';
        $mediaPath = $this->scheduledPost->media_path;

        return match ($platform) {
            'facebook' => $this->postToFacebook($account, $content, $mediaPath),
            default => throw new \Exception(
                "Publicação automática para $platform ainda não está disponível (de momento só Facebook). "
                . "Instagram exige uma conta IG Business + URL pública da imagem; TikTok exige a Content Posting API."
            ),
        };
    }

    /**
     * Publica uma foto (ou texto) numa Página do Facebook associada à conta.
     * Usa o user token para descobrir a Página e o respetivo Page Access Token,
     * e envia a imagem por multipart (sem precisar de URL pública).
     */
    protected function postToFacebook($account, string $content, ?string $mediaPath): bool
    {
        $userToken = $account->access_token;

        // Descobre a Página e o token da Página (necessário para publicar).
        $pages = Http::get('https://graph.facebook.com/v19.0/me/accounts', [
            'access_token' => $userToken,
        ])->throw()->json('data', []);

        if (empty($pages)) {
            throw new \Exception('Nenhuma Página do Facebook associada a esta conta. É preciso gerir uma Página.');
        }

        $page = $pages[0];
        $pageId = $page['id'];
        $pageToken = $page['access_token'];

        if ($mediaPath && Storage::disk('local')->exists($mediaPath)) {
            // Publica a imagem na Página.
            $res = Http::attach('source', Storage::disk('local')->get($mediaPath), 'flyer.png')
                ->post("https://graph.facebook.com/v19.0/{$pageId}/photos", [
                    'caption' => $content,
                    'access_token' => $pageToken,
                ]);
        } else {
            // Sem imagem: publica apenas texto no feed.
            $res = Http::post("https://graph.facebook.com/v19.0/{$pageId}/feed", [
                'message' => $content,
                'access_token' => $pageToken,
            ]);
        }

        if ($res->failed()) {
            throw new \Exception('Facebook: ' . $res->json('error.message', 'erro desconhecido ao publicar.'));
        }

        Log::info("Publicado no Facebook (página {$pageId}) para o utilizador {$account->user_id}.");
        return true;
    }
}
