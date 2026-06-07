# Estrutura da Base de Dados

O projeto utiliza uma combinação de **IndexedDB** (navegador) para estado local e **PostgreSQL** (servidor) para persistência em produção.

## IndexedDB (Frontend - Navegador)

O **IndexedDB** permite armazenamento local de imagens e estados do editor sem necessidade de servidor.

### Banco de Dados: `MahunguStudioDB`
**Versão:** 1

#### Object Store: `flyers`
Armazena histórico local de flyers criados.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | Number (Key) | Timestamp único |
| `title` | String | Título do flyer |
| `category` | String | Categoria (Notícias, Tecnologia, etc) |
| `content` | String | Conteúdo/resumo |
| `html` | String | HTML renderizado |
| `image` | String (Base64) | Imagem em Base64 |
| `status` | String | Pendente, Rascunho, Publicado |
| `captions` | Object | Legendas (short, medium, long) |

#### Object Store: `proposals`
Armazena propostas geradas pela IA.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | Number (Key) | ID único |
| `title` | String | Título da proposta |
| `summary` | String | Resumo/descrição |
| `captions` | Object | 3 variantes de legenda |
| `template` | String | Template selecionado |
| `status` | String | pending, approved, rejected |
| `sourceName` | String | Fonte da notícia |

#### Object Store: `sources`
Armazena fontes RSS configuradas.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | Number (Key) | ID único |
| `name` | String | Nome do portal |
| `url` | String | URL do feed RSS |
| `category` | String | Categoria |
| `active` | Boolean | Se está monitorando |

---

## PostgreSQL (Backend - Servidor)

Para produção, os dados são sincronizados com um banco de dados PostgreSQL via Laravel.

### Tabela: `flyers`

```sql
CREATE TABLE flyers (
  id BIGINT PRIMARY KEY,
  title VARCHAR(255),
  category VARCHAR(100) DEFAULT 'Notícias',
  content TEXT,
  template VARCHAR(50) DEFAULT 'classic',
  html LONGTEXT,
  image LONGTEXT,
  background_image LONGTEXT,
  status VARCHAR(50) DEFAULT 'Pendente',
  captions JSON,
  metadata JSON,
  approved_from BIGINT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### Tabela: `proposals`

```sql
CREATE TABLE proposals (
  id BIGINT PRIMARY KEY,
  title VARCHAR(255),
  summary TEXT,
  category VARCHAR(100) DEFAULT 'Notícias',
  captions JSON,
  template VARCHAR(50) DEFAULT 'classic',
  status VARCHAR(50) DEFAULT 'pending',
  source_id BIGINT,
  source_name VARCHAR(255),
  source_url VARCHAR(2000),
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### Tabela: `news_sources`

```sql
CREATE TABLE news_sources (
  id BIGINT PRIMARY KEY,
  name VARCHAR(255),
  url VARCHAR(2000),
  category VARCHAR(100) DEFAULT 'Notícias',
  active BOOLEAN DEFAULT true,
  last_checked TIMESTAMP,
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### Tabela: `users`

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  avatar_url VARCHAR(2000),
  api_key VARCHAR(255),
  monitoring_interval INT DEFAULT 15,
  theme VARCHAR(50) DEFAULT 'dark',
  settings JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

---

## Setup da Database

### 1. Instalar Dependências Laravel
```bash
composer install
```

### 2. Configurar .env
```bash
cp .env.example .env
# Editar as variáveis de database:
# DB_CONNECTION=pgsql
# DB_HOST=localhost
# DB_DATABASE=mahungu_studio
# DB_USERNAME=mahungu_user
# DB_PASSWORD=senha_segura
```

### 3. Gerar Chave da Aplicação
```bash
php artisan key:generate
```

### 4. Executar Migrations
```bash
php artisan migrate
```

### 5. Fazer Seed dos Dados Iniciais
```bash
php artisan db:seed --class=NewsSourceSeeder
```

### 6. Limpar Cache
```bash
php artisan cache:clear
php artisan config:clear
```

---

## Models Disponíveis

- `App\Models\Flyer` - Gerenciar flyers
- `App\Models\Proposal` - Gerenciar propostas IA
- `App\Models\NewsSource` - Gerenciar fontes RSS
- `App\Models\User` - Gerenciar utilizadores

### Exemplo de Uso (Tinker)
```bash
php artisan tinker

# Listar todos os flyers
App\Models\Flyer::all();

# Criar novo flyer
App\Models\Flyer::create([
  'title' => 'Meu Flyer',
  'category' => 'Notícias',
  'content' => 'Conteúdo aqui',
  'status' => 'Pendente'
]);

# Encontrar flyer por ID
App\Models\Flyer::find(1);

# Atualizar status
$flyer = App\Models\Flyer::find(1);
$flyer->update(['status' => 'Aprovado']);
```

