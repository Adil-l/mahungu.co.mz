# Deploy — Laravel Forge (mahungu.co.mz)

App: Laravel 10 · PHP 8.1 · MySQL/MariaDB · fila `database` · scheduler.
Sem build de frontend (assets estáticos em `public/`).

## 1. Servidor no Forge
1. Cria um servidor (DigitalOcean/Hetzner/etc.) com **PHP 8.1** e **MySQL 8 / MariaDB**.
2. Cria a base de dados (ex.: `mahungu`) e anota utilizador/palavra-passe.

## 2. Site
1. Forge → **New Site**. Domínio: `mahungu.co.mz`.
2. **Web Directory:** `/public` (já é o default do Forge para Laravel).
3. Liga o repositório GitHub `Adil-l/mahungu.co.mz`, branch `main`. Ativa **Quick Deploy**.

## 3. Variáveis de ambiente
No separador **Environment** do site, cola o conteúdo de [`.env.example`](../.env.example) e preenche:
- `APP_KEY` → gera depois com `php artisan key:generate` (ou Forge gera).
- `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` → os da base criada no passo 1.
- `MAIL_*` → SMTP real (necessário para recuperação de palavra-passe).
- `*_CLIENT_ID` / `*_CLIENT_SECRET` → OAuth das redes sociais (quando integrares).

Confirma: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://mahungu.co.mz`.

## 4. Deploy Script (Forge → Deploy Script)
```bash
cd $FORGE_SITE_PATH

git pull origin $FORGE_SITE_BRANCH

$FORGE_COMPOSER install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# Gera a APP_KEY apenas se ainda não existir
php artisan key:generate --force --no-interaction || true

php artisan migrate --force

php artisan config:cache
php artisan route:cache
php artisan view:cache

# Reinicia o worker da fila para apanhar o código novo
php artisan queue:restart
```

## 5. Scheduler (cron)
Forge → **Scheduler** → adiciona um job a correr **a cada minuto**:
```
php /home/forge/mahungu.co.mz/artisan schedule:run
```
Isto aciona `ProcessScheduledPosts` (posts agendados) e o fetch de RSS.

## 6. Queue Worker (Daemon)
Forge → **Daemons** → novo daemon:
```
php /home/forge/mahungu.co.mz/artisan queue:work --queue=default --sleep=3 --tries=3 --max-time=3600
```
Necessário porque `PostToSocialMedia` é `ShouldQueue` (`QUEUE_CONNECTION=database`).

## 7. SSL
Forge → **SSL** → Let's Encrypt para `mahungu.co.mz` (e `www.` se aplicável).
Aponta o DNS do domínio para o IP do servidor antes de emitir o certificado.

## 8. Primeiro deploy
1. Clica **Deploy Now**.
2. Corre os seeders uma vez (Forge → Commands): `php artisan db:seed --force`
   (cria os 3 utilizadores e as fontes de notícias; a senha está definida em `UserSeeder` — altera-a após o primeiro login).

## Checklist pós-deploy
- [ ] `https://mahungu.co.mz` carrega o SPA.
- [ ] Login funciona (utilizadores do seeder).
- [ ] Email de recuperação chega (SMTP).
- [ ] Daemon da fila ativo (Forge mostra "running").
- [ ] Scheduler a correr (verifica `storage/logs` após 1 min).
