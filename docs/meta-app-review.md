# Meta App Review — Mahungu (guia de submissão)

Objetivo: tirar a App Meta do modo **Desenvolvimento** para **Live + Advanced Access**,
o que levanta o rate limit `(#4)` e permite publicar a sério no Instagram/Facebook.

> Os textos de justificação estão em **inglês** porque a equipa de revisão da Meta
> revê em inglês. As notas em português são para ti.

---

## 0. Antes de submeter (checklist)

- [ ] **Business Verification** concluída (Definições do Negócio → Centro de Segurança).
- [ ] **Privacy Policy URL:** `https://mahungu.xyz/privacidade`
- [ ] **Terms of Service URL:** `https://mahungu.xyz/termos`
- [ ] **User Data Deletion:** callback `https://mahungu.xyz/api/meta/data-deletion` (ou instruções `https://mahungu.xyz/eliminar-dados`)
- [ ] **Deauthorize Callback URL:** `https://mahungu.xyz/api/meta/deauthorize`
- [ ] App em produção (Deploy feito) e `FACEBOOK_CLIENT_SECRET` no ambiente.
- [ ] **Conta de teste** criada na Mahungu para o revisor (não há auto-registo — ver secção 4).
- [ ] **Screencast** gravado (secção 3) e carregado.
- [ ] Ícone da app (1024×1024), categoria e email de contacto preenchidos.

---

## 1. Descrição da App (campo "App details" / "How will your app use these permissions")

> **EN (colar):**
> Mahungu is a content management and publishing tool for news pages in Mozambique.
> A logged-in user connects the Facebook Page(s) and Instagram Business account they
> manage, creates posts (text and image "flyers"), and schedules or publishes them to
> their own connected accounts. The user also sees the public engagement of their posts
> in an analytics dashboard. Every publish action is initiated and authorized by the user.

---

## 2. Justificação por permissão (colar em cada "Permission" → "How will you use…")

### Facebook

**`pages_show_list`** — *(PT: listar as Páginas que o utilizador gere para ele escolher)*
> EN: Mahungu lets the user connect a Facebook Page they manage. We use `pages_show_list`
> to display the list of Pages the logged-in user administers so they can select which
> Page to connect and publish to. Without it the user cannot choose their Page.
> Shown in the screencast at the "Connect Facebook → select Page" step.

**`pages_read_engagement`** — *(PT: ler posts/engajamento da Página para o painel de métricas)*
> EN: After the user connects a Page, Mahungu shows that Page's recent posts and their
> public engagement (reactions, comments, shares) in an analytics dashboard so the user
> can measure performance. We use `pages_read_engagement` to read this content and
> engagement only for the Page the user selected and authorized.
> Shown at the "Insights / Dashboard" step.

**`pages_manage_posts`** — *(PT: publicar/agendar posts na Página do utilizador — funcionalidade central)*
> EN: The core feature is creating, scheduling and publishing posts (text and image
> flyers) to the user's own Facebook Page. We use `pages_manage_posts` to publish the
> content the user creates and approves, at the time they choose, to the Page they
> connected. Every post is user-initiated.
> Shown at "Create post → Schedule/Publish → the post appears on the Page".

**`business_management`** — *(PT: Páginas/IG que pertencem a um Portefólio de Negócios)*
> EN: Many users manage their Page and Instagram account through a Meta Business
> Portfolio. We use `business_management` so Pages and Instagram Business accounts owned
> by the user's Business Portfolio appear in the selectable account list. Without it,
> business-owned Pages do not appear in `/me/accounts` and cannot be connected.
> Shown at "Connect → a business-owned Page appears and is selected".

### Instagram

**`instagram_basic`** — *(PT: identificar a conta IG Business ligada à Página)*
> EN: Mahungu publishes to the Instagram Business account linked to the user's connected
> Facebook Page. We use `instagram_basic` to identify that linked Instagram Business
> account (ID, username, media) so the user can select it as a publishing target and see
> their account. Shown at "Connect Instagram → account is displayed".

**`instagram_content_publish`** — *(PT: publicar fotos/carrosséis/stories no IG — central)*
> EN: A core feature is publishing the user's created content (photos, carousels and
> stories) to their Instagram Business account. We use `instagram_content_publish` to
> create and publish these media containers to the Instagram account the user connected
> and authorized, at the scheduled time. Every post is user-initiated.
> Shown at "Create post → publish to Instagram → it appears on the IG account".

### (Opcional) se pedires métricas da PRÓPRIA conta
**`instagram_manage_insights`** / **`read_insights`**
> EN: Used to display the performance metrics (reach, impressions, engagement) of the
> user's own connected Instagram/Facebook posts in the analytics dashboard.
> *(Só pede isto se mostrares insights da conta do utilizador. O scan de fontes usa
> Business Discovery de contas públicas, que assenta em `instagram_basic` +
> `pages_read_engagement`.)*

### Threads (App/produto SEPARADO — submeter à parte)
**`threads_basic`** — identify the user's Threads profile to connect it.
**`threads_content_publish`** — publish the user's content to their connected Threads profile.

`public_profile` é concedida por omissão e normalmente não precisa de Advanced Access.

---

## 3. Guião do Screencast (o vídeo de demonstração)

Requisitos da Meta: mostrar o **login do Facebook**, o **ecrã de consentimento com as
permissões**, e **cada permissão a ser usada** numa funcionalidade real, terminando no
**resultado** (post publicado). Narração em **inglês** ou com **legendas em inglês**.
Usa uma **conta de teste** com uma Página + IG Business de teste. ~2–3 min.

| # | Mostra no ecrã | Narração (EN) | Permissão demonstrada |
|---|----------------|---------------|------------------------|
| 1 | Abre `mahungu.xyz`, faz login na app | "This is Mahungu, a tool to publish news content to a user's own social pages." | — |
| 2 | Vai a Perfil → ligar contas, clica **Ligar Facebook** | "The user connects the Facebook Page they manage." | — |
| 3 | Diálogo do Facebook Login + **ecrã de consentimento** (pausa a mostrar as permissões) | "They log in with Facebook and grant the requested permissions." | (todas) |
| 4 | Lista de Páginas aparece → seleciona a Página (de Business) | "We use pages_show_list and business_management to show and select the Page, including business-owned Pages." | `pages_show_list`, `business_management` |
| 5 | Clica **Ligar Instagram** → consentimento → conta IG mostrada | "We use instagram_basic to identify the Instagram Business account linked to the Page." | `instagram_basic` |
| 6 | Cria um post (escreve/gera o flyer), escolhe Facebook + Instagram, **Publicar agora** | "The user creates a post and publishes it to their own Page and Instagram." | — |
| 7 | Abre a **Página do Facebook** → o post está lá | "We use pages_manage_posts to publish to the Page." | `pages_manage_posts` |
| 8 | Abre a **conta do Instagram** → o post está lá | "We use instagram_content_publish to publish to Instagram." | `instagram_content_publish` |
| 9 | Painel de métricas com engajamento da Página/IG | "We use pages_read_engagement to show the post's public engagement." | `pages_read_engagement` |
| 10 | Mostra `/eliminar-dados` (ou remover a app no Facebook) | "Users can delete their data at any time." | — |

Dicas: grava em 1080p, sem cortes nas partes do login/consentimento, e mostra mesmo
o **post a aparecer** na Página/IG (não basta dizer "publicado").

---

## 4. Instruções para o revisor (campo "Instructions" / test credentials)

A Mahungu **não tem auto-registo** (as contas são criadas pelo admin). Por isso:

1. Cria uma **conta de teste** na app e mete as credenciais no campo de instruções:
   > EN: "Log in at https://mahungu.xyz with email: `reviewer@mahungu.xyz` / password: `<senha>`.
   > Then open Profile → Connect accounts → Connect Facebook, grant permissions, select a
   > Page, then Connect Instagram. Create a post and publish to see pages_manage_posts and
   > instagram_content_publish in action. The analytics dashboard shows pages_read_engagement."
2. Adiciona a conta de Facebook do revisor (ou cria um **Test User** em App Roles → Test Users)
   com uma Página + IG Business de teste, para ele poder conceder e ver as permissões.
3. Garante que a publicação usa o **token concedido pelo utilizador** (OAuth), não só o
   token fixo da marca — ver "Cuidado importante" abaixo.

---

## 5. ✅ Publicação com o token do utilizador (RESOLVIDO no código)

> Era a causa comum de reprovação: a App Review exige que o revisor veja as
> **permissões que ELE concedeu** a serem usadas **na conta dele**. Se a app só
> publicasse na Página da marca (via `FACEBOOK_PAGE_TOKEN`), a Meta reprovava com
> "não conseguimos ver a permissão a ser usada".

O `PostToSocialMedia` agora **prefere SEMPRE a conta OAuth ligada pelo utilizador**
(linha em `handle()`): se o autor do post tem uma `SocialAccount` válida para a
plataforma, publica com o token DELE (na Página/IG que ele ligou). Só quando **não há
conta ligada** (o caso do agendador da marca) é que recorre ao `FACEBOOK_PAGE_TOKEN`.

Implicação prática: para o revisor, basta ligar a conta dele (Perfil → Ligar Facebook /
Instagram) e publicar — sai na Página/IG dele e a Meta vê as permissões em uso.
⚠️ Em produção, os admins **não devem ligar contas pessoais** (senão os posts sairiam na
página pessoal, não na da marca) — quem publica em nome da marca confia no token fixo.

**Login for Business:** o login passa `config_id` (a Configuration criada no painel) via
`FACEBOOK_CONFIG_ID` no `.env` — sem ele, as permissões certas não são pedidas. Preenche
essa variável com o *Configuration ID* antes de testar/gravar o screencast.

---

## 6. Outras causas comuns de reprovação

- App **não acessível** ao revisor → fornece credenciais de teste (secção 4).
- Permissão **não demonstrada** no vídeo → cada uma tem de aparecer em uso.
- **Privacy Policy** inacessível ou genérica → a nossa está em `/privacidade` (específica).
- **Business Verification** incompleta.
- Botão de login do Facebook **não funciona** na região do revisor → testa antes.
- Domínio/URLs de OAuth e callbacks **não registados** nas Definições da app.
