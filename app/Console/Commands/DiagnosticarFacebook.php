<?php

namespace App\Console\Commands;

use App\Models\SocialAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class DiagnosticarFacebook extends Command
{
    protected $signature = 'mahungu:fb-diag {--user= : ID do utilizador cuja conta Facebook ligada será testada}
                                            {--token= : Testar diretamente este access_token (ignora a conta ligada)}';

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

        return self::SUCCESS;
    }
}
