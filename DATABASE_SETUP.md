# Mahungu Studio - Setup Database

## Pré-requisitos

- PHP 8.1+
- PostgreSQL 12+
- Composer
- Node.js (para assets)

## Instalação Local

### 1. Clonar repositório
```bash
git clone https://github.com/Adil-l/mahungu.co.mz.git
cd mahungu.co.mz
```

### 2. Instalar dependências PHP
```bash
composer install
```

### 3. Copiar arquivo .env
```bash
cp .env.example .env
```

### 4. Configurar database em .env
```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=mahungu_studio
DB_USERNAME=mahungu_user
DB_PASSWORD=sua_senha_segura
```

### 5. Gerar chave da aplicação
```bash
php artisan key:generate
```

### 6. Executar migrations
```bash
php artisan migrate
```

### 7. Popular database com dados iniciais
```bash
php artisan db:seed --class=NewsSourceSeeder
```

### 8. Limpar cache
```bash
php artisan cache:clear
php artisan config:clear
```

### 9. Testar acesso (modo desenvolvimento)
```bash
php artisan serve
# Abrir http://localhost:8000
```

---

## Estrutura de Dados

### Flyers
- Armazena flyers criados no editor
- Status: Pendente, Rascunho, Aprovado, Publicado
- Contém HTML, imagens e metadados

### Proposals
- Propostas geradas automaticamente pela IA
- Baseadas em notícias de feeds RSS
- Com 3 variantes de legenda

### News Sources
- Feeds RSS monitorados automaticamente
- Categorias: Notícias, Tecnologia, Economia, etc
- Intervalo configurável de verificação

### Users
- Perfil do utilizador
- Configurações (API key, intervalo, tema)
- Histórico de atividades

---

## API Endpoints (Futuro)

```
GET  /api/flyers              - Listar flyers
POST /api/flyers              - Criar flyer
GET  /api/flyers/{id}         - Obter flyer
PUT  /api/flyers/{id}         - Atualizar flyer
DELETE /api/flyers/{id}       - Deletar flyer

GET  /api/proposals           - Listar propostas
POST /api/proposals           - Criar proposta
PUT  /api/proposals/{id}      - Atualizar proposta
DELETE /api/proposals/{id}    - Deletar proposta

GET  /api/sources             - Listar fontes
POST /api/sources             - Adicionar fonte
PUT  /api/sources/{id}        - Atualizar fonte
DELETE /api/sources/{id}      - Deletar fonte

POST /api/backup              - Fazer backup
POST /api/restore             - Restaurar backup
```

---

## Troubleshooting

### Erro: "No such file or directory: /database/migrations"
```bash
mkdir -p database/seeders
mkdir -p database/migrations
```

### Erro: "Base table or view not found"
```bash
php artisan migrate:fresh
php artisan db:seed
```

### Erro de conexão PostgreSQL
- Verificar se PostgreSQL está rodando
- Verificar credenciais em .env
- Testar conexão: `psql -U mahungu_user -d mahungu_studio`

### Cache expirado
```bash
php artisan cache:clear
php artisan route:cache
php artisan view:clear
```

---

## Backup & Restore

### Fazer backup da database
```bash
pg_dump -U mahungu_user mahungu_studio > backup.sql
```

### Restaurar backup
```bash
psql -U mahungu_user mahungu_studio < backup.sql
```

### Backup via Laravel
```bash
php artisan tinker
>>> Artisan::call('db:seed', ['--class' => 'DatabaseSeeder']);
```

---

## Produção

### Variáveis importantes
- `APP_ENV=production`
- `APP_DEBUG=false`
- `DB_PASSWORD` - senha forte
- `APP_KEY` - gerada automaticamente

### Deploy
```bash
git pull origin main
composer install --no-dev
php artisan migrate --force
php artisan cache:clear
```
