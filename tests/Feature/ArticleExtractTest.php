<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ArticleExtractor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ArticleExtractTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_auth(): void
    {
        $this->getJson('/api/article-extract?url=https://example.com')->assertStatus(401);
    }

    public function test_validates_url(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/article-extract?url=not-a-url')->assertStatus(422);
    }

    public function test_rejects_private_url_ssrf(): void
    {
        // URL para IP privado/loopback → recusado SEM rede (resolveSafeIps devolve []).
        $user = User::factory()->create();
        $res = $this->actingAs($user)->getJson('/api/article-extract?url=http://127.0.0.1/admin');
        $res->assertOk()->assertJson(['ok' => false]);
    }

    public function test_rejects_cloud_metadata_url_ssrf(): void
    {
        $user = User::factory()->create();
        $res = $this->actingAs($user)->getJson('/api/article-extract?url=http://169.254.169.254/latest/meta-data/');
        $res->assertOk()->assertJson(['ok' => false]);
    }

    public function test_extracts_article_paragraphs_and_strips_noise(): void
    {
        $extractor = new ArticleExtractor();
        $html = <<<'HTML'
        <html><head>
            <meta name="description" content="resumo curto">
            <style>.x{color:red}</style>
        </head><body>
            <nav><a href="/">Início</a> Menu</nav>
            <article>
                <h1>Estados Unidos nos dezasseis-avos</h1>
                <p>A selecção norte-americana venceu por 2-0 a Austrália, em Seattle, e apurou-se para os dezasseis-avos-de-final do Mundial.</p>
                <p>Os tentos foram apontados por Alex Freeman e por um autogolo de Cameron Burgess.</p>
                <script>console.log('lixo que nao deve aparecer')</script>
            </article>
            <footer>Rodapé com direitos reservados e ligações</footer>
        </body></html>
        HTML;

        $text = $extractor->extractText($html);

        $this->assertStringContainsString('venceu por 2-0', $text);
        $this->assertStringContainsString('Alex Freeman', $text);
        // Ruído removido: nav, footer, script.
        $this->assertStringNotContainsString('Menu', $text);
        $this->assertStringNotContainsString('Rodapé', $text);
        $this->assertStringNotContainsString('lixo que nao deve aparecer', $text);
    }

    public function test_falls_back_to_meta_description_when_no_paragraphs(): void
    {
        $extractor = new ArticleExtractor();
        $html = '<html><head><meta property="og:description" content="Resumo via og:description"></head><body><div>Sem paragrafos uteis</div></body></html>';
        $this->assertStringContainsString('Resumo via og:description', $extractor->extractText($html));
    }
}
