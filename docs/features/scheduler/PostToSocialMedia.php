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

    public function failed(\Throwable $exception): void
    {
        if (in_array($this->scheduledPost->status, ['pending', 'processing'], true)) {
            $this->scheduledPost->update([
                'status' => 'failed',
                'error_message' => ['exception' => $exception->getMessage()],
            ]);
        }
    }

    /**
     * Despacha para o método correto de cada plataforma.
     */
    protected function postToPlatform($platform, SocialAccount $account)
    {
        return match ($platform) {
            'facebook' => $this->postToFacebook($account),
            'instagram' => $this->postToInstagram($account),
            'tiktok' => $this->postToTikTok($account),
            default => throw new \Exception("Plataforma '$platform' não suportada."),
        };
    }

    /**
     * Retorna a URL pública absoluta do media (flyer), se existir.
     */
    protected function getMediaUrl(): ?string
    {
        if (!$this->scheduledPost->media_path) {
            return null;
        }

        // Se já for uma URL absoluta (ex: http(s)://...), usa diretamente
        if (str_starts_with($this->scheduledPost->media_path, 'http')) {
            return $this->scheduledPost->media_path;
        }

        // Caso contrário, assume que está no disco 'public'
        return Storage::disk('public')->url($this->scheduledPost->media_path);
    }

    /**
     * Posta numa Página do Facebook via Graph API.
     * Requer: access_token com permissão pages_manage_posts,
     * platform_user_id = ID da Página (Page ID).
     */
    protected function postToFacebook(SocialAccount $account)
    {
        $apiVersion = config('services.facebook.api_version', 'v19.0');
        $pageId = $account->platform_user_id;
        $message = $this->scheduledPost->content;
        $mediaUrl = $this->getMediaUrl();

        if ($mediaUrl) {
            // Publica como foto (com legenda)
            $response = Http::asForm()->post(
                "https://graph.facebook.com/{$apiVersion}/{$pageId}/photos",
                [
                    'url' => $mediaUrl,
                    'caption' => $message,
                    'access_token' => $account->access_token,
                ]
            );
        } else {
            // Publica apenas texto
            $response = Http::asForm()->post(
                "https://graph.facebook.com/{$apiVersion}/{$pageId}/feed",
                [
                    'message' => $message,
                    'access_token' => $account->access_token,
                ]
            );
        }

        $this->throwIfFailed($response, 'facebook');

        return $response->json();
    }

    /**
     * Posta no Instagram (via conta business vinculada ao Facebook) usando o
     * fluxo de Container -> Publish da Graph API.
     * Requer: access_token com permissão instagram_content_publish,
     * platform_user_id = Instagram Business Account ID.
     */
    protected function postToInstagram(SocialAccount $account)
    {
        $apiVersion = config('services.facebook.api_version', 'v19.0');
        $igUserId = $account->platform_user_id;
        $caption = $this->scheduledPost->content;
        $mediaUrl = $this->getMediaUrl();

        if (!$mediaUrl) {
            throw new \Exception('Instagram requer uma imagem ou vídeo para publicar.');
        }

        // 1. Cria o container de mídia
        $createResponse = Http::asForm()->post(
            "https://graph.facebook.com/{$apiVersion}/{$igUserId}/media",
            [
                'image_url' => $mediaUrl,
                'caption' => $caption,
                'access_token' => $account->access_token,
            ]
        );

        $this->throwIfFailed($createResponse, 'instagram');

        $creationId = $createResponse->json('id');

        if (!$creationId) {
            throw new \Exception('Instagram: falha ao criar container de mídia.');
        }

        // 2. Publica o container
        $publishResponse = Http::asForm()->post(
            "https://graph.facebook.com/{$apiVersion}/{$igUserId}/media_publish",
            [
                'creation_id' => $creationId,
                'access_token' => $account->access_token,
            ]
        );

        $this->throwIfFailed($publishResponse, 'instagram');

        return $publishResponse->json();
    }

    /**
     * Posta um vídeo no TikTok via Content Posting API (fluxo PULL_FROM_URL).
     * Requer: access_token com escopo video.publish.
     * Nota: TikTok exige vídeo, não aceita imagem estática como post regular.
     */
    protected function postToTikTok(SocialAccount $account)
    {
        $mediaUrl = $this->getMediaUrl();

        if (!$mediaUrl) {
            throw new \Exception('TikTok requer um vídeo para publicar.');
        }

        $response = Http::withToken($account->access_token)
            ->post('https://open.tiktokapis.com/v2/post/publish/video/init/', [
                'post_info' => [
                    'title' => $this->scheduledPost->content,
                    'privacy_level' => 'SELF_ONLY', // ajustar conforme necessidade (ex: PUBLIC_TO_EVERYONE)
                    'disable_duet' => false,
                    'disable_comment' => false,
                    'disable_stitch' => false,
                ],
                'source_info' => [
                    'source' => 'PULL_FROM_URL',
                    'video_url' => $mediaUrl,
                ],
            ]);

        $this->throwIfFailed($response, 'tiktok');

        return $response->json();
    }

    /**
     * Lança exceção se a resposta HTTP indicar erro, extraindo a mensagem
     * de erro específica de cada plataforma quando possível.
     */
    protected function throwIfFailed($response, string $platform): void
    {
        if ($response->successful()) {
            return;
        }

        $body = $response->json();

        $message = match ($platform) {
            'facebook', 'instagram' => $body['error']['message'] ?? 'Erro desconhecido na Graph API.',
            'tiktok' => $body['error']['message'] ?? $body['error']['code'] ?? 'Erro desconhecido na API do TikTok.',
            default => 'Erro desconhecido.',
        };

        throw new \Exception("Erro na API do $platform: $message");
    }
}
