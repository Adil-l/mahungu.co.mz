<?php

namespace App\Console\Commands;

use App\Models\SocialAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class DiagnosticarFacebook extends Command
{
    protected $signature = 'mahungu:fb-diag {--user= : ID do utilizador cuja conta Facebook ligada será testada}
                                            {--token= : Testar diretamente este access_token (ignora a conta ligada)}
                                            {--post-test : Publica um post de teste na Página e mostra a resposta crua do Facebook}';

    protected $description = 'Diagnostica o porquê de o Facebook não publicar: mostra permissões concedidas e Páginas visíveis para o token.';

    public function handle(): int
    {
        $token = $this->option('token');

        if (!$token) {
            $query = SocialAccount::where('platform', 'facebook');
            if ($userId = $this->option('user')) {
                $query->where('user_id', $userId);
            }
            $account = $query->latest('id')->first();

            if (!$account) {
                $this->error('Nenhuma conta de Facebook ligada encontrada. Liga uma conta primeiro, ou passa --token=...');
                return self::FAILURE;
            }

            $token = $account->access_token;
            $this->line("A usar a conta #{$account->id} (utilizador {$account->user_id}, '{$account->platform_username}').");
        }

        // 1) Quem é o token (valida que o token funciona de todo)
        $me = Http::get('https://graph.facebook.com/v19.0/me', [
            'fields' => 'id,name',
            'access_token' => $token,
        ])->json();

        if (isset($me['error'])) {
            $this->error('Token inválido/expirado: ' . ($me['error']['message'] ?? 'erro desconhecido.'));
            return self::FAILURE;
        }
        $this->info("Token OK — utilizador Facebook: {$me['name']} (id {$me['id']}).");

        // 2) Que permissões foram realmente concedidas vs. recusadas
        $perms = Http::get('https://graph.facebook.com/v19.0/me/permissions', [
            'access_token' => $token,
        ])->json('data', []);

        $granted = [];
        $declined = [];
        foreach ($perms as $p) {
            if ($p['status'] === 'granted') {
                $granted[] = $p['permission'];
            } else {
                $declined[] = $p['permission'];
            }
        }

        $this->newLine();
        $this->line('Permissões CONCEDIDAS: ' . (implode(', ', $granted) ?: '(nenhuma)'));
        if ($declined) {
            $this->warn('Permissões RECUSADAS:  ' . implode(', ', $declined));
        }

        $precisas = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];
        $faltam = array_diff($precisas, $granted);
        if ($faltam) {
            $this->warn('FALTAM para publicar: ' . implode(', ', $faltam) . ' → volta a ligar a conta e aceita estas permissões.');
        }

        // 3) Páginas que o token consegue gerir (é isto que dá o erro "Nenhuma Página")
        $pages = Http::get('https://graph.facebook.com/v19.0/me/accounts', [
            'access_token' => $token,
        ])->json('data', []);

        $this->newLine();
        if (empty($pages)) {
            $this->error('me/accounts veio VAZIO — é exatamente isto que causa "Nenhuma Página associada".');
            $this->line('Causa: a conta não administra nenhuma Página, OU não marcaste a Página no ecrã de login do Facebook,');
            $this->line('OU a conta não é Tester/Admin da app (modo Desenvolvimento). Nada disto se corrige no código.');
            return self::FAILURE;
        }

        $this->info('Páginas visíveis (' . count($pages) . '):');
        foreach ($pages as $page) {
            $tasks = implode('/', $page['tasks'] ?? []);
            $podePublicar = in_array('CREATE_CONTENT', $page['tasks'] ?? [], true) ? 'PODE publicar' : 'SEM permissão de publicar';
            $this->line("  • {$page['name']} (id {$page['id']}) — {$podePublicar} [tasks: {$tasks}]");
        }

        // 4) Inspeciona a 1.ª Página: token da Página, estado de publicação e
        //    últimas publicações — para confirmar se os posts aparecem mesmo.
        $page = $pages[0];
        $pageId = $page['id'];
        $pageToken = $page['access_token'] ?? $token;

        $info = Http::get("https://graph.facebook.com/v19.0/{$pageId}", [
            'fields' => 'name,is_published,link',
            'access_token' => $pageToken,
        ])->json();

        $this->newLine();
        if (array_key_exists('is_published', $info)) {
            $pub = $info['is_published'];
            $this->line('Página "' . ($info['name'] ?? $pageId) . '" publicada/visível: ' . ($pub ? 'SIM' : 'NÃO'));
            if (!$pub) {
                $this->warn('A Página está NÃO PUBLICADA → os posts via API são aceites (200) mas NÃO ficam visíveis. Publica a Página nas Definições da Página.');
            }
            if (!empty($info['link'])) {
                $this->line('Link: ' . $info['link']);
            }
        }

        $feed = Http::get("https://graph.facebook.com/v19.0/{$pageId}/feed", [
            'fields' => 'id,message,created_time,permalink_url',
            'limit' => 5,
            'access_token' => $pageToken,
        ])->json();

        $this->newLine();
        if (isset($feed['error'])) {
            $this->warn('Não consegui ler o feed da Página: ' . ($feed['error']['message'] ?? 'erro.'));
        } else {
            $posts = $feed['data'] ?? [];
            $this->info('Últimas publicações na Página (' . count($posts) . '):');
            foreach ($posts as $post) {
                $msg = \Illuminate\Support\Str::limit($post['message'] ?? '(sem texto)', 60);
                $this->line("  • {$post['created_time']} — {$msg}");
                if (!empty($post['permalink_url'])) {
                    $this->line('    ' . $post['permalink_url']);
                }
            }
            if (empty($posts)) {
                $this->warn('O feed está vazio — nenhuma publicação na Página (apesar dos logs de "Publicado").');
            }
        }

        // 5) Teste de publicação opcional: mostra a resposta crua do Facebook.
        if ($this->option('post-test')) {
            $msg = 'Teste Mahungu ' . now()->toDateTimeString();
            $res = Http::post("https://graph.facebook.com/v19.0/{$pageId}/feed", [
                'message' => $msg,
                'access_token' => $pageToken,
            ]);
            $this->newLine();
            $this->line('POST de teste → HTTP ' . $res->status());
            $this->line('Resposta crua: ' . $res->body());
            if ($res->successful() && $res->json('id')) {
                $this->info('O Facebook devolveu um id de post: ' . $res->json('id') . ' — confirma se aparece na Página.');
            }
        }

        return self::SUCCESS;
    }
}
