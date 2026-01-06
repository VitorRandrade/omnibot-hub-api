-- ============================================
-- OmniBot Hub - Multi-Tenant Schema Update
-- Version: 2.0.0
-- Tabelas para conversas e mensagens multi-tenant
-- ============================================

-- ============================================
-- TABELA: contatos (clientes/customers)
-- Multi-tenant com tenant_id
-- ============================================
CREATE TABLE IF NOT EXISTS contatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    company_id UUID,
    nome VARCHAR(255),
    email VARCHAR(255),
    telefone VARCHAR(50),
    canal_origem VARCHAR(50),
    canal_user_id VARCHAR(255),
    avatar VARCHAR(500),
    tags JSONB DEFAULT '[]',
    metadata JSONB,
    total_conversas INTEGER DEFAULT 0,
    ultimo_contato TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABELA: conversas (conversations)
-- Multi-tenant com tenant_id e company_id
-- ============================================
CREATE TABLE IF NOT EXISTS conversas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    company_id UUID,
    cliente_id UUID REFERENCES contatos(id) ON DELETE SET NULL,
    agente_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    canal VARCHAR(50) NOT NULL CHECK (canal IN ('whatsapp', 'instagram', 'facebook', 'telegram', 'web', 'email')),
    status VARCHAR(50) DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_atendimento', 'resolvida', 'fechada')),
    prioridade VARCHAR(20) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
    assunto VARCHAR(500),
    ultima_mensagem TEXT,
    ultima_atividade TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    nota_satisfacao DECIMAL(3,2),
    tempo_resposta_medio INTEGER,
    escalado_humano BOOLEAN DEFAULT false,
    escalado_em TIMESTAMP WITH TIME ZONE,
    resolvido_em TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABELA: mensagens (messages)
-- Multi-tenant com tenant_id
-- ============================================
CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    conversa_id UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    remetente_tipo VARCHAR(20) NOT NULL CHECK (remetente_tipo IN ('cliente', 'agente', 'sistema', 'bot')),
    remetente_id UUID,
    conteudo TEXT NOT NULL,
    tipo VARCHAR(50) DEFAULT 'text' CHECK (tipo IN ('text', 'image', 'audio', 'video', 'document', 'location', 'sticker', 'contact')),
    media_url VARCHAR(500),
    metadata JSONB,
    lida BOOLEAN DEFAULT false,
    lida_em TIMESTAMP WITH TIME ZONE,
    resposta_para UUID REFERENCES mensagens(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ÍNDICES para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_contatos_tenant_id ON contatos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contatos_telefone ON contatos(telefone);
CREATE INDEX IF NOT EXISTS idx_contatos_email ON contatos(email);
CREATE INDEX IF NOT EXISTS idx_contatos_company_id ON contatos(company_id);

CREATE INDEX IF NOT EXISTS idx_conversas_tenant_id ON conversas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversas_company_id ON conversas(company_id);
CREATE INDEX IF NOT EXISTS idx_conversas_cliente_id ON conversas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_agente_id ON conversas(agente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_status ON conversas(status);
CREATE INDEX IF NOT EXISTS idx_conversas_canal ON conversas(canal);
CREATE INDEX IF NOT EXISTS idx_conversas_ultima_atividade ON conversas(ultima_atividade DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_tenant_id ON mensagens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_id ON mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at ON mensagens(created_at);
CREATE INDEX IF NOT EXISTS idx_mensagens_lida ON mensagens(lida) WHERE lida = false;
CREATE INDEX IF NOT EXISTS idx_mensagens_remetente ON mensagens(remetente_tipo, remetente_id);

-- ============================================
-- TRIGGERS para updated_at
-- ============================================
CREATE TRIGGER IF NOT EXISTS update_contatos_updated_at
    BEFORE UPDATE ON contatos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_conversas_updated_at
    BEFORE UPDATE ON conversas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Adicionar tenant_id à tabela users se não existir
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE users ADD COLUMN tenant_id UUID;
        -- Atualizar tenant_id para ser o próprio ID do usuário (self-tenant)
        UPDATE users SET tenant_id = id WHERE tenant_id IS NULL;
    END IF;
END $$;

-- ============================================
-- Adicionar tenant_id à tabela agents se não existir
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE agents ADD COLUMN tenant_id UUID;
        -- Copiar user_id para tenant_id
        UPDATE agents SET tenant_id = user_id WHERE tenant_id IS NULL;
    END IF;
END $$;

-- ============================================
-- Adicionar colunas extras na tabela agents se não existirem
-- ============================================
DO $$
BEGIN
    -- Adicionar nome se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'nome'
    ) THEN
        ALTER TABLE agents ADD COLUMN nome VARCHAR(255);
        UPDATE agents SET nome = name WHERE nome IS NULL;
    END IF;

    -- Adicionar tipo se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'tipo'
    ) THEN
        ALTER TABLE agents ADD COLUMN tipo VARCHAR(50) DEFAULT 'assistant';
    END IF;

    -- Adicionar descricao se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'descricao'
    ) THEN
        ALTER TABLE agents ADD COLUMN descricao TEXT;
        UPDATE agents SET descricao = description WHERE descricao IS NULL;
    END IF;

    -- Adicionar mcp_key se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'mcp_key'
    ) THEN
        ALTER TABLE agents ADD COLUMN mcp_key VARCHAR(255) UNIQUE;
    END IF;

    -- Adicionar configuracoes (JSONB) se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'configuracoes'
    ) THEN
        ALTER TABLE agents ADD COLUMN configuracoes JSONB DEFAULT '{}';
    END IF;

    -- Adicionar metricas (JSONB) se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'metricas'
    ) THEN
        ALTER TABLE agents ADD COLUMN metricas JSONB DEFAULT '{}';
    END IF;
END $$;

-- ============================================
-- Índice para mcp_key
-- ============================================
CREATE INDEX IF NOT EXISTS idx_agents_mcp_key ON agents(mcp_key);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id);

-- ============================================
-- Tabela imagens (se não existir) - multi-tenant
-- ============================================
CREATE TABLE IF NOT EXISTS imagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    caminho VARCHAR(500) NOT NULL,
    tamanho INTEGER NOT NULL,
    mime_type VARCHAR(100),
    largura INTEGER,
    altura INTEGER,
    url_publica VARCHAR(500),
    uso_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_imagens_tenant_id ON imagens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imagens_categoria ON imagens(categoria);

-- ============================================
-- Tabela documentos (se não existir) - multi-tenant
-- ============================================
CREATE TABLE IF NOT EXISTS documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    tamanho INTEGER NOT NULL,
    caminho VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'processado', 'error', 'erro', 'processando')),
    erro_processamento TEXT,
    texto_extraido TEXT,
    embeddings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_id ON documentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documentos_status ON documentos(status);

-- ============================================
-- Tabela produtos (se não existir) - multi-tenant
-- ============================================
CREATE TABLE IF NOT EXISTS produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    categoria VARCHAR(100),
    descricao TEXT,
    preco DECIMAL(12,2) NOT NULL DEFAULT 0,
    estoque INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'esgotado', 'baixo_estoque')),
    imagem_url VARCHAR(500),
    atributos JSONB,
    total_vendas INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_produtos_tenant_id ON produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);

-- ============================================
-- Trigger para documentos
-- ============================================
CREATE TRIGGER IF NOT EXISTS update_documentos_updated_at
    BEFORE UPDATE ON documentos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_imagens_updated_at
    BEFORE UPDATE ON imagens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_produtos_updated_at
    BEFORE UPDATE ON produtos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
