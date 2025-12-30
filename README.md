# OmniBot Hub API

Backend API para o OmniBot Hub - Plataforma de atendimento com agentes IA.

## Stack Tecnológico

- **Node.js 20+** + **Express** + **TypeScript**
- **PostgreSQL 15** - Banco de dados
- **JWT** - Autenticação
- **Multer** - Upload de arquivos
- **Zod** - Validação

## Requisitos

- Node.js 20+
- Docker e Docker Compose (para PostgreSQL local)
- npm ou yarn

## Instalação e Execução

### 1. Instalar dependências

```bash
cd omnibot-hub-api
npm install
```

### 2. Subir PostgreSQL com Docker

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Isso vai:
- Subir o PostgreSQL na porta 5432
- Executar a migration automaticamente
- Criar usuário admin: `admin@omnibot.com` / `admin123`
- Subir Adminer (interface web) na porta 8081

### 3. Configurar variáveis de ambiente

O arquivo `.env` já está configurado para desenvolvimento local.

Para conectar a uma VPS remota, edite o `.env`:

```env
# VPS Remota
DATABASE_URL=postgresql://omnibot:SENHA@IP_DA_VPS:5432/omnibot_prod
DB_HOST=IP_DA_VPS
DB_PORT=5432
DB_NAME=omnibot_prod
DB_USER=omnibot
DB_PASSWORD=SENHA_DA_VPS
```

### 4. Rodar o servidor

```bash
npm run dev
```

O servidor vai iniciar em `http://localhost:3001`

## Endpoints da API

### Autenticação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/v1/auth/register` | Registrar usuário |
| POST | `/v1/auth/login` | Login |
| POST | `/v1/auth/refresh` | Renovar token |
| POST | `/v1/auth/logout` | Logout |
| GET | `/v1/auth/me` | Dados do usuário |

### Agentes IA

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/v1/agents` | Listar agentes |
| POST | `/v1/agents` | Criar agente |
| PATCH | `/v1/agents/:id` | Atualizar agente |
| DELETE | `/v1/agents/:id` | Remover agente |

### Produtos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/v1/products` | Listar produtos |
| POST | `/v1/products` | Criar produto |
| PATCH | `/v1/products/:id` | Atualizar produto |
| DELETE | `/v1/products/:id` | Remover produto |

### Imagens

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/v1/images` | Listar imagens |
| POST | `/v1/images/upload` | Upload de imagem |
| GET | `/v1/public/images/:id` | **Servir imagem (público)** |

### Webhooks (n8n)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/v1/webhooks/n8n/message` | Receber mensagem |
| POST | `/v1/webhooks/n8n/event` | Receber evento |
| POST | `/v1/webhooks/n8n/product-update` | Atualizar produto |

## Configurar PostgreSQL na VPS

```bash
# Instalar PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Criar usuário e banco
sudo -u postgres psql
CREATE USER omnibot WITH PASSWORD 'SENHA_SEGURA';
CREATE DATABASE omnibot_prod OWNER omnibot;
GRANT ALL PRIVILEGES ON DATABASE omnibot_prod TO omnibot;
\q

# Permitir conexões externas
sudo nano /etc/postgresql/15/main/postgresql.conf
# Mudar: listen_addresses = '*'

sudo nano /etc/postgresql/15/main/pg_hba.conf
# Adicionar: host all omnibot 0.0.0.0/0 scram-sha-256

# Reiniciar e abrir porta
sudo systemctl restart postgresql
sudo ufw allow 5432/tcp
```

Depois, execute a migration conectando remotamente:

```bash
psql -h IP_DA_VPS -U omnibot -d omnibot_prod -f src/database/migrations/001_initial_schema.sql
```

## Exemplo de Uso com n8n

### Receber mensagem do WhatsApp

Configure o n8n para enviar um POST para:

```
POST http://localhost:3001/v1/webhooks/n8n/message
Headers:
  X-Webhook-Secret: seu_segredo_webhook_aqui
  Content-Type: application/json

Body:
{
  "channel": "whatsapp",
  "from": {
    "id": "5511999999999",
    "name": "Cliente",
    "phone": "+5511999999999"
  },
  "message": {
    "type": "text",
    "content": "Olá, preciso de ajuda"
  }
}
```

### Acessar imagem pública

```
GET http://localhost:3001/v1/public/images/{imageId}
```

Esta rota é pública (não precisa de autenticação) e pode ser usada no n8n.

## Testar a API

### Login

```bash
curl -X POST http://localhost:3001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@omnibot.com", "password": "admin123"}'
```

### Criar agente (com token)

```bash
curl -X POST http://localhost:3001/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"name": "Vendas Bot", "description": "Bot de vendas"}'
```

## Scripts Disponíveis

- `npm run dev` - Desenvolvimento com hot reload
- `npm run build` - Build para produção
- `npm start` - Rodar build de produção
- `npm run lint` - Verificar código
- `npm run typecheck` - Verificar tipos

## Estrutura de Pastas

```
omnibot-hub-api/
├── src/
│   ├── config/           # Configurações
│   ├── modules/          # Módulos da API
│   │   ├── auth/         # Autenticação
│   │   ├── agents/       # Agentes IA
│   │   ├── products/     # Produtos
│   │   ├── images/       # Imagens
│   │   ├── documents/    # Documentos
│   │   └── webhooks/     # Webhooks n8n
│   ├── shared/           # Código compartilhado
│   ├── database/         # Migrations
│   ├── app.ts            # Configuração Express
│   └── server.ts         # Entry point
├── uploads/              # Arquivos enviados
├── docker-compose.dev.yml
├── package.json
└── .env
```
