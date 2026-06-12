# Ligação às redes sociais + agendamento

## Como funciona o agendamento (já operacional)

1. No app, agendas um post (texto + imagem do flyer + plataformas + data/hora).
2. O **agendador** (`schedule:work` em dev, ou cron em produção) corre a cada minuto
   o comando `mahungu:process-scheduled-posts`.
3. Esse comando apanha os posts cuja hora já chegou e despacha o job `PostToSocialMedia`.
4. O job publica em cada plataforma ligada e marca o post como
   `posted` / `partially_posted` / `failed` (com a mensagem de erro).

**Em dev (ngrok):** o `./mostrar-site.sh` já arranca o agendador automaticamente.
**Em produção:** ver cron em [DEPLOY-ORACLE.md](DEPLOY-ORACLE.md).

> Para ver o fluxo a funcionar **sem** configurar a Meta, liga o modo simulação:
> `SOCIAL_SIMULATE=true` no `.env`. Os posts agendados passam a `posted` (sem publicar
> de verdade). Põe `false` quando tiveres a Meta a sério.

---

## A realidade da publicação no Facebook/Instagram

Publicar automaticamente exige permissões que a Meta **só liberta após revisão**:

| Plataforma | Permissões | Precisa de |
|---|---|---|
| Facebook (Página) | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` | App Review + Verificação de Negócio |
| Instagram (Business) | `instagram_basic`, `instagram_content_publish`, `pages_show_list` | App Review + Verificação de Negócio + conta IG Business |

**Mas para testar tu mesmo, não precisas de revisão:** em **Modo de Desenvolvimento**, os
utilizadores com papel na app (Admin/Programador/Testador) podem usar estas permissões nas
**suas próprias** Páginas/contas. É assim que validas tudo antes de submeter para revisão.

---

## Passos para testar já (Modo de Desenvolvimento)

### Pré-requisitos
- Uma **Página de Facebook** que giras (cria uma grátis se não tiveres).
- Para Instagram: uma conta **Instagram Business/Creator** ligada a essa Página
  (na app Instagram: Definições → Conta → Mudar para conta profissional).

### Na app da Meta (developers.facebook.com → a tua app `1700275334323120`)

1. **Adiciona o produto "Facebook Login"** (se ainda não estiver): Painel → + Adicionar Produto → Facebook Login → Configurar.
2. **Facebook Login → Definições → URIs de redirecionamento OAuth válidos:**
   ```
   http://localhost:8000/api/social-accounts/facebook/callback
   http://localhost:8000/api/social-accounts/instagram/callback
   ```
   (Usa `localhost` para testar — a Meta aceita-o sem App Domains. Em produção troca pelo domínio real.)
3. **Adiciona as permissões** no caso de uso da app (Casos de Uso → Personalizar →
   adicionar `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`,
   e para IG `instagram_basic`, `instagram_content_publish`). Com **Acesso Padrão**
   já dá para testares como Admin.
4. **Funções da App → Funções:** garante que a tua conta (`gavumendeadilson@gmail.com`)
   é Admin (já é, como criador).

### No projeto
1. Para testar localmente, aponta o `.env`:
   ```
   APP_URL=http://localhost:8000
   SOCIAL_SIMULATE=false
   ```
   e abre o app por **http://localhost:8000** (não pelo ngrok).
2. Liga a conta: no app → ligar Facebook / Instagram → autoriza com a conta Admin,
   escolhe a Página (e a conta IG Business).
3. Agenda um post para daqui a 2 minutos e confirma que aparece na Página/Instagram.

---

## Passar para "toda a gente" (produção)

Quando os testes correrem, submete na app da Meta:
- **App Review** das permissões acima (vídeo a demonstrar o fluxo + descrição).
- **Verificação de Negócio** (documentos da empresa).
- Política de Privacidade pública (já tens o URL configurado).

Só depois é que utilizadores fora da lista de testadores conseguem ligar as contas.

> **TikTok / Twitter / Threads:** não estão implementados no job. TikTok exige a
> Content Posting API (e revisão própria); dá para acrescentar mais tarde.
