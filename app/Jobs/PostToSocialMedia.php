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

    /** Ids dos posts publicados, por plataforma (p/ métricas por-post). */
    protected array $postIds = [];

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
                // Modo simulação: marca como publicado sem contas nem APIs reais.
                // Demonstra o fluxo agendamento->publicação antes da aprovação da
                // Meta. Activa com SOCIAL_SIMULATE=true no .env.
                if (config('services.social.simulate')) {
                    Log::info("[SIMULAÇÃO] Publicaria no $platform (post #{$this->scheduledPost->id}).");
                    $successCount++;
                    continue;
                }

                // X (Twitter): publica na conta da marca via OAuth 1.0a com tokens
                // fixos do .env — não há ligação OAuth por utilizador.
                if ($platform === 'twitter') {
                    $this->postToTwitter();
                    $successCount++;
                    continue;
                }

                // Facebook com token fixo (Utilizador de Sistema/Página) no .env:
                // publica na Página da marca sem depender da ligação OAuth por
                // utilizador. É o caminho fiável para Páginas de um negócio.
                if ($platform === 'facebook' && config('services.facebook.page_token')) {
                    $this->postToFacebookPage();
                    $successCount++;
                    continue;
                }

                // Instagram com o mesmo token fixo: a conta IG Business está ligada
                // à Página, e o token de sistema tem instagram_content_publish.
                if ($platform === 'instagram' && config('services.facebook.page_token')) {
                    $this->postToInstagramViaToken();
                    $successCount++;
                    continue;
                }

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
            $update = ['status' => 'posted', 'error_message' => null];
        } elseif ($successCount > 0) {
            $update = ['status' => 'partially_posted', 'error_message' => $errors];
        } else {
            $update = ['status' => 'failed', 'error_message' => $errors];
        }

        // Guarda os ids dos posts publicados (p/ ir buscar métricas depois).
        if (!empty($this->postIds)) {
            $meta = $this->scheduledPost->metadata ?? [];
            $meta['platform_post_ids'] = array_merge($meta['platform_post_ids'] ?? [], $this->postIds);
            $update['metadata'] = $meta;
        }

        $this->scheduledPost->update($update);
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
            'instagram' => $this->postToInstagram($account, $content, $mediaPath),
            'threads' => $this->postToThreads($account, $content, $mediaPath),
            default => throw new \Exception(
                "Publicação automática para $platform ainda não está disponível. "
                . "TikTok exige a Content Posting API e ainda não está implementado."
            ),
        };
    }

    /**
     * Publica no Threads (Meta). Fluxo em dois passos como o Instagram:
     * cria um container (TEXT ou IMAGE) e depois publica-o.
     * Com imagem, o Threads vai buscar a imagem a um URL público (image_url).
     */
    protected function postToThreads($account, string $content, ?string $mediaPath): bool
    {
        $token = $account->access_token;
        $userId = $account->platform_user_id;

        if (!$userId) {
            throw new \Exception('Threads: conta sem identificador. Reconecta a conta.');
        }

        $base = "https://graph.threads.net/v1.0/{$userId}";

        if ($mediaPath && Storage::disk(config('filesystems.media_disk'))->exists($mediaPath)) {
            // O Threads precisa de um URL público da imagem (não aceita upload de bytes).
            $createParams = [
                'media_type' => 'IMAGE',
                'image_url' => Storage::disk(config('filesystems.media_disk'))->url($mediaPath),
                'text' => $content,
                'access_token' => $token,
            ];
        } else {
            if (trim($content) === '') {
                throw new \Exception('Threads: nada para publicar (sem texto nem imagem).');
            }
            $createParams = [
                'media_type' => 'TEXT',
                'text' => $content,
                'access_token' => $token,
            ];
        }

        // 1) Cria o container de media
        $container = Http::post("{$base}/threads", $createParams);
        if ($container->failed()) {
            throw new \Exception('Threads (container): ' . $container->json('error.message', 'erro ao preparar a publicação.'));
        }

        // 2) Publica o container
        $publish = Http::post("{$base}/threads_publish", [
            'creation_id' => $container->json('id'),
            'access_token' => $token,
        ]);
        if ($publish->failed()) {
            throw new \Exception('Threads (publish): ' . $publish->json('error.message', 'erro ao publicar.'));
        }

        $this->postIds['threads'] = $publish->json('id');
        Log::info("Publicado no Threads (conta {$userId}) para o utilizador {$account->user_id}.");
        return true;
    }

    /**
     * Publica no X (Twitter) na conta da marca via OAuth 1.0a (tokens fixos do
     * .env). Se o post tiver imagem, faz primeiro o upload e anexa-a ao tweet.
     */
    protected function postToTwitter(): string
    {
        $twitter = app(\App\Services\TwitterService::class);

        if (!$twitter->configured()) {
            throw new \Exception('X (Twitter) não está configurado (faltam tokens no .env).');
        }

        $content = $this->scheduledPost->content ?? '';
        $mediaPath = $this->scheduledPost->media_path;

        $mediaIds = [];
        if ($mediaPath && Storage::disk(config('filesystems.media_disk'))->exists($mediaPath)) {
            $mediaIds[] = $twitter->uploadMedia(Storage::disk(config('filesystems.media_disk'))->get($mediaPath), 'flyer.png');
        }

        if (trim($content) === '' && empty($mediaIds)) {
            throw new \Exception('Nada para publicar no X (sem texto nem imagem).');
        }

        $tweetId = $twitter->postTweet($content, $mediaIds);
        $this->postIds['twitter'] = $tweetId;
        Log::info("Publicado no X (tweet {$tweetId}) para o utilizador {$this->scheduledPost->user_id}.");

        return $tweetId;
    }

    /**
     * Publica na Página da marca usando um token fixo do .env (FACEBOOK_PAGE_TOKEN),
     * normalmente de um Utilizador de Sistema com a Página atribuída. Resolve a
     * Página e o respetivo Page Access Token via /me/accounts (que, ao contrário
     * do OAuth por utilizador, inclui Páginas de negócio atribuídas ao sistema).
     * FACEBOOK_PAGE_ID é opcional: escolhe a Página certa quando há várias.
     */
    /**
     * Resolve a Página da marca a partir do token fixo. PRIORIZA o FACEBOOK_PAGE_ID:
     * usa-o diretamente (não depende de /me/accounts, que vem VAZIO com tokens de
     * Utilizador de Sistema). Só na sua ausência tenta descobrir via /me/accounts
     * (funciona com tokens de Utilizador normais). Devolve [pageId, pageToken].
     */
    protected function resolveSystemPage(?string $token): array
    {
        $pageId = config('services.facebook.page_id');
        if ($pageId) {
            // Obtém o TOKEN DA PÁGINA (Page Access Token) — é o correto para
            // publicar numa Página. Publicar com o token de Sistema/Utilizador
            // direto dá "(#200) publish_actions ... deprecated".
            $pageToken = Http::get("https://graph.facebook.com/v19.0/{$pageId}", [
                'fields' => 'access_token',
                'access_token' => $token,
            ])->json('access_token') ?: $token;
            if ($pageToken === $token) {
                Log::warning("FB/IG: não consegui obter o Page Access Token da Página {$pageId} (a usar o token de Sistema). " .
                    "Se a publicação falhar com (#200)/publish_actions, o Utilizador de Sistema precisa de papel de publicação NA Página no Business Manager (e o token, business_management + pages_manage_posts).");
            }
            return [$pageId, $pageToken];
        }
        $pages = Http::get('https://graph.facebook.com/v19.0/me/accounts', [
            'access_token' => $token,
        ])->json('data', []);
        if (!empty($pages)) {
            return [$pages[0]['id'], $pages[0]['access_token'] ?? $token];
        }
        return [null, $token];
    }

    protected function postToFacebookPage(): bool
    {
        $token = config('services.facebook.page_token');
        [$pageId, $pageToken] = $this->resolveSystemPage($token);

        if (!$pageId) {
            throw new \Exception(
                'O token fixo do Facebook não vê nenhuma Página. Define FACEBOOK_PAGE_ID no .env '
                . '(e limpa a cache de config: "php artisan config:clear", ou re-deploy), ou atribui a '
                . 'Página ao Utilizador de Sistema com a permissão business_management.'
            );
        }

        $content = $this->scheduledPost->content ?? '';
        $mediaPath = $this->scheduledPost->media_path;

        $hasMedia = $mediaPath && Storage::disk(config('filesystems.media_disk'))->exists($mediaPath);

        // Story da Página (token de sistema): usa o fluxo próprio /photo_stories
        // em vez do /photos do feed — senão o "story" sai como post normal.
        if ($hasMedia && $this->scheduledPost->media_type === 'story') {
            $this->postIds['facebook'] = $this->postFacebookPhotoStory($pageId, $pageToken, $mediaPath);
            Log::info("Publicado Story no Facebook (Página {$pageId}) via token fixo.");
            return true;
        }

        if ($hasMedia) {
            $res = Http::attach('source', Storage::disk(config('filesystems.media_disk'))->get($mediaPath), 'flyer.png')
                ->post("https://graph.facebook.com/v19.0/{$pageId}/photos", [
                    'caption' => $content,
                    'access_token' => $pageToken,
                ]);
        } else {
            $res = Http::post("https://graph.facebook.com/v19.0/{$pageId}/feed", [
                'message' => $content,
                'access_token' => $pageToken,
            ]);
        }

        if ($res->failed()) {
            throw new \Exception('Facebook: ' . $res->json('error.message', 'erro ao publicar na Página.'));
        }

        $this->postIds['facebook'] = $res->json('post_id') ?? $res->json('id');
        Log::info("Publicado no Facebook (Página {$pageId}) via token fixo.");
        return true;
    }

    /**
     * Publica no Instagram da marca usando o token fixo (FACEBOOK_PAGE_TOKEN).
     * Resolve a Página → a conta IG Business ligada → cria o container com o
     * URL público da imagem (do bucket) → publica. Exige imagem e que o URL
     * da imagem seja acessível publicamente (bucket público).
     */
    protected function postToInstagramViaToken(): bool
    {
        $token = config('services.facebook.page_token');
        [$pageId, $pageToken] = $this->resolveSystemPage($token);

        if (!$pageId) {
            throw new \Exception('Instagram: não foi possível resolver a Página a partir do token fixo. Define FACEBOOK_PAGE_ID no .env (e limpa a cache: "php artisan config:clear" ou re-deploy) com o id da Página à qual a conta IG Business está ligada, ou garante que o token tem business_management e a Página atribuída.');
        }

        // Conta IG Business ligada à Página
        $igId = Http::get("https://graph.facebook.com/v19.0/{$pageId}", [
            'fields' => 'instagram_business_account',
            'access_token' => $pageToken,
        ])->json('instagram_business_account.id');

        if (!$igId) {
            throw new \Exception('A Página não tem uma conta Instagram Business ligada.');
        }

        $disk = Storage::disk(config('filesystems.media_disk'));
        $mediaPath = $this->scheduledPost->media_path;
        if (!$mediaPath || !$disk->exists($mediaPath)) {
            throw new \Exception('O Instagram exige uma imagem para publicar.');
        }

        $content = $this->scheduledPost->content ?? '';

        // Carrossel: slide 1 = media_path, slides 2..N = carousel_paths.
        if ($this->scheduledPost->media_type === 'carousel' && !empty($this->scheduledPost->carousel_paths)) {
            $urls = array_map(fn ($p) => $disk->url($p), array_merge([$mediaPath], $this->scheduledPost->carousel_paths));
            $this->postIds['instagram'] = $this->publishInstagramCarousel($igId, $urls, $content, $pageToken);
            Log::info("Publicado no Instagram (conta {$igId}) via token fixo [CAROUSEL].");
            return true;
        }

        // Foto única ou Story.
        $imageUrl = $disk->url($mediaPath);
        $igMediaType = ($this->scheduledPost->media_type === 'story') ? 'STORIES' : 'IMAGE';
        $this->postIds['instagram'] = $this->publishInstagramPhoto($igId, $imageUrl, $content, $pageToken, $igMediaType);

        Log::info("Publicado no Instagram (conta {$igId}) via token fixo [{$igMediaType}].");
        return true;
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

        $hasMedia = $mediaPath && Storage::disk(config('filesystems.media_disk'))->exists($mediaPath);

        // Story da Página do Facebook: tem um fluxo PRÓPRIO (não é o /photos do
        // feed). Sobe a foto como não-publicada e depois publica-a em
        // /photo_stories. Sem isto, um "story" saía como post normal no feed.
        if ($hasMedia && $this->scheduledPost->media_type === 'story') {
            $this->postIds['facebook'] = $this->postFacebookPhotoStory($pageId, $pageToken, $mediaPath);
            Log::info("Publicado Story no Facebook (página {$pageId}) para o utilizador {$account->user_id}.");
            return true;
        }

        if ($hasMedia) {
            // Publica a imagem na Página (post de feed).
            $res = Http::attach('source', Storage::disk(config('filesystems.media_disk'))->get($mediaPath), 'flyer.png')
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

        $this->postIds['facebook'] = $res->json('post_id') ?? $res->json('id');
        Log::info("Publicado no Facebook (página {$pageId}) para o utilizador {$account->user_id}.");
        return true;
    }

    /**
     * Publica um Story de FOTO numa Página do Facebook. Fluxo em 2 passos da
     * Graph API: (1) sobe a foto como NÃO publicada (published=false,
     * temporary=true) para obter o photo_id; (2) publica-a como Story em
     * /photo_stories. A foto deve ser vertical (9:16) — a captura de story do
     * editor já é 1080x1920. Requer a permissão pages_manage_posts.
     */
    protected function postFacebookPhotoStory(string $pageId, string $pageToken, string $mediaPath): ?string
    {
        // 1) Upload da foto SEM a publicar no feed (fica disponível p/ o Story).
        $upload = Http::attach('source', Storage::disk(config('filesystems.media_disk'))->get($mediaPath), 'story.jpg')
            ->post("https://graph.facebook.com/v19.0/{$pageId}/photos", [
                'published' => 'false',
                'temporary' => 'true',
                'access_token' => $pageToken,
            ]);
        if ($upload->failed()) {
            throw new \Exception('Facebook (Story/upload): ' . $upload->json('error.message', 'erro ao preparar a imagem do Story.'));
        }
        $photoId = $upload->json('id');

        // 2) Publica a foto como Story da Página.
        $publish = Http::post("https://graph.facebook.com/v19.0/{$pageId}/photo_stories", [
            'photo_id' => $photoId,
            'access_token' => $pageToken,
        ]);
        if ($publish->failed()) {
            throw new \Exception('Facebook (Story/publish): ' . $publish->json('error.message', 'erro ao publicar o Story.'));
        }

        return $publish->json('post_id') ?? $publish->json('id');
    }

    /**
     * Publica uma imagem numa conta Instagram Business ligada a uma Página.
     * Fluxo da Graph API: descobrir a Página -> a conta IG -> criar container
     * de media (com URL público da imagem) -> publicar o container.
     */
    protected function postToInstagram($account, string $content, ?string $mediaPath): bool
    {
        if (!$mediaPath || !Storage::disk(config('filesystems.media_disk'))->exists($mediaPath)) {
            throw new \Exception('O Instagram exige uma imagem para publicar.');
        }

        $userToken = $account->access_token;

        // 1) Página + Page Access Token
        $pages = Http::get('https://graph.facebook.com/v19.0/me/accounts', [
            'access_token' => $userToken,
        ])->throw()->json('data', []);

        if (empty($pages)) {
            throw new \Exception('Nenhuma Página do Facebook associada (necessária para o Instagram).');
        }

        $page = $pages[0];
        $pageToken = $page['access_token'];

        // 2) Conta Instagram Business ligada à Página
        $igId = Http::get("https://graph.facebook.com/v19.0/{$page['id']}", [
            'fields' => 'instagram_business_account',
            'access_token' => $pageToken,
        ])->throw()->json('instagram_business_account.id');

        if (!$igId) {
            throw new \Exception('Esta Página não tem uma conta Instagram Business ligada.');
        }

        // 3) URL público da imagem (o IG vai buscá-la; não aceita upload de bytes).
        $imageUrl = Storage::disk(config('filesystems.media_disk'))->url($mediaPath);

        // 4-5) Cria o container, espera o IG processar a imagem e publica.
        $igMediaType = ($this->scheduledPost->media_type === 'story') ? 'STORIES' : 'IMAGE';
        $this->postIds['instagram'] = $this->publishInstagramPhoto($igId, $imageUrl, $content, $pageToken, $igMediaType);

        Log::info("Publicado no Instagram (conta {$igId}) para o utilizador {$account->user_id} [{$igMediaType}].");
        return true;
    }

    /**
     * Cria o container de media do Instagram, ESPERA o processamento assíncrono
     * (o IG vai buscar a imagem ao image_url) e só depois publica. Sem a espera,
     * o media_publish devolve "Media ID is not available" porque o container
     * ainda está em IN_PROGRESS. Se a imagem não for acessível publicamente o
     * container vai a ERROR — aqui isso é reportado de forma clara.
     */
    protected function publishInstagramPhoto(string $igId, string $imageUrl, string $caption, string $token, string $mediaType = 'IMAGE'): ?string
    {
        $params = ['image_url' => $imageUrl, 'access_token' => $token];
        if ($mediaType === 'STORIES') {
            $params['media_type'] = 'STORIES'; // Stories não levam legenda
        } else {
            $params['caption'] = $caption;
        }
        $container = Http::post("https://graph.facebook.com/v19.0/{$igId}/media", $params);
        if ($container->failed()) {
            throw new \Exception('Instagram (container): ' . $container->json('error.message', 'erro ao preparar a imagem (o URL é público?).'));
        }
        $creationId = $container->json('id');

        $this->waitForContainer($creationId, $token);

        $publish = Http::post("https://graph.facebook.com/v19.0/{$igId}/media_publish", [
            'creation_id' => $creationId,
            'access_token' => $token,
        ]);
        if ($publish->failed()) {
            throw new \Exception('Instagram (publish): ' . $publish->json('error.message', 'erro ao publicar.'));
        }

        return $publish->json('id');
    }

    /**
     * Espera um container de media do Instagram ficar FINISHED (processamento
     * assíncrono). Lança exceção clara se falhar (ERROR = URL não público) ou
     * se exceder o tempo. Usado por fotos, stories e carrossel.
     */
    protected function waitForContainer(string $creationId, string $token): void
    {
        $status = null;
        $detalhe = '';
        // ~60s (20×3s): stories/imagens grandes e a busca do URL pelo IG demoram.
        for ($i = 0; $i < 20; $i++) {
            $statusRes = Http::get("https://graph.facebook.com/v19.0/{$creationId}", [
                'fields' => 'status_code,status',
                'access_token' => $token,
            ]);
            // Se a própria leitura do estado falhar (token/permissão), guarda o
            // motivo — senão o status_code fica null e o erro diria só "desconhecido".
            if ($err = $statusRes->json('error.message')) {
                $detalhe = $err;
            }
            $status = $statusRes->json('status_code');
            if ($s = $statusRes->json('status')) {
                $detalhe = $s;
            }
            if ($status === 'FINISHED') {
                return;
            }
            if ($status === 'ERROR') {
                throw new \Exception('Instagram: o processamento falhou (ERROR) — quase sempre o URL da imagem não está acessível publicamente ao Instagram (o bucket/objeto S3 tem de ser público). ' . $detalhe);
            }
            sleep(3);
        }
        Log::warning("IG container timeout: creationId={$creationId}, status=" . ($status ?? 'null') . ", detalhe={$detalhe}");
        throw new \Exception('Instagram: o conteúdo não ficou pronto a tempo (status: ' . ($status ?? 'desconhecido') . '). Causa habitual: a imagem no S3 não está acessível publicamente ao Instagram (abre o image_url numa janela anónima para confirmar), ou o ficheiro é grande. ' . $detalhe);
    }

    /**
     * Publica um CARROSSEL no Instagram: cria um container-filho por imagem
     * (is_carousel_item), espera todos, cria o container CAROUSEL e publica.
     * Requer 2 a 10 imagens, todas com URL público.
     */
    protected function publishInstagramCarousel(string $igId, array $imageUrls, string $caption, string $token): ?string
    {
        $imageUrls = array_values(array_filter($imageUrls));
        if (count($imageUrls) < 2) {
            throw new \Exception('Instagram: um carrossel precisa de pelo menos 2 imagens.');
        }
        $imageUrls = array_slice($imageUrls, 0, 10); // o IG aceita no máximo 10

        $children = [];
        foreach ($imageUrls as $url) {
            $c = Http::post("https://graph.facebook.com/v19.0/{$igId}/media", [
                'image_url' => $url,
                'is_carousel_item' => 'true',
                'access_token' => $token,
            ]);
            if ($c->failed()) {
                throw new \Exception('Instagram (carrossel/item): ' . $c->json('error.message', 'erro ao preparar uma imagem.'));
            }
            $children[] = $c->json('id');
        }

        foreach ($children as $childId) {
            $this->waitForContainer($childId, $token);
        }

        $parent = Http::post("https://graph.facebook.com/v19.0/{$igId}/media", [
            'media_type' => 'CAROUSEL',
            'children' => implode(',', $children),
            'caption' => $caption,
            'access_token' => $token,
        ]);
        if ($parent->failed()) {
            throw new \Exception('Instagram (carrossel): ' . $parent->json('error.message', 'erro ao preparar o carrossel.'));
        }
        $parentId = $parent->json('id');
        $this->waitForContainer($parentId, $token);

        $publish = Http::post("https://graph.facebook.com/v19.0/{$igId}/media_publish", [
            'creation_id' => $parentId,
            'access_token' => $token,
        ]);
        if ($publish->failed()) {
            throw new \Exception('Instagram (carrossel/publish): ' . $publish->json('error.message', 'erro ao publicar.'));
        }

        return $publish->json('id');
    }
}
