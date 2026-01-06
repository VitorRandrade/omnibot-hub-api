-- ============================================
-- OmniBot Hub - Flows/Workflows Schema
-- Version: 3.0.0
-- Tabelas para fluxos de automação (n8n integration)
-- ============================================

-- ============================================
-- TABELA: fluxos (flows/workflows)
-- Multi-tenant com tenant_id
-- ============================================
CREATE TABLE IF NOT EXISTS fluxos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    company_id UUID,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo VARCHAR(50) DEFAULT 'automation' CHECK (tipo IN ('automation', 'chatbot', 'integration', 'notification')),
    status VARCHAR(50) DEFAULT 'inativo' CHECK (status IN ('ativo', 'inativo', 'rascunho', 'erro')),
    trigger_type VARCHAR(50) CHECK (trigger_type IN ('webhook', 'schedule', 'event', 'manual')),
    trigger_config JSONB DEFAULT '{}',
    -- n8n integration
    n8n_workflow_id VARCHAR(255),
    n8n_webhook_url VARCHAR(500),
    n8n_active BOOLEAN DEFAULT false,
    -- Flow definition (visual editor)
    nodes JSONB DEFAULT '[]',
    edges JSONB DEFAULT '[]',
    variables JSONB DEFAULT '{}',
    -- Execution stats
    total_execucoes INTEGER DEFAULT 0,
    execucoes_sucesso INTEGER DEFAULT 0,
    execucoes_erro INTEGER DEFAULT 0,
    ultima_execucao TIMESTAMP WITH TIME ZONE,
    tempo_medio_execucao INTEGER, -- in milliseconds
    -- Metadata
    versao INTEGER DEFAULT 1,
    publicado_em TIMESTAMP WITH TIME ZONE,
    tags JSONB DEFAULT '[]',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABELA: execucoes_fluxo (flow executions)
-- Log de execuções dos fluxos
-- ============================================
CREATE TABLE IF NOT EXISTS execucoes_fluxo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    fluxo_id UUID NOT NULL REFERENCES fluxos(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pendente' CHECK (status IN ('pendente', 'executando', 'sucesso', 'erro', 'cancelado')),
    trigger_type VARCHAR(50),
    trigger_data JSONB,
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    error_details JSONB,
    nodes_executed JSONB DEFAULT '[]',
    tempo_execucao INTEGER, -- in milliseconds
    iniciado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finalizado_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABELA: templates_fluxo (flow templates)
-- Templates pré-configurados
-- ============================================
CREATE TABLE IF NOT EXISTS templates_fluxo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    categoria VARCHAR(100),
    tipo VARCHAR(50),
    icone VARCHAR(100),
    nodes JSONB DEFAULT '[]',
    edges JSONB DEFAULT '[]',
    variables JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT true,
    uso_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ÍNDICES para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_fluxos_tenant_id ON fluxos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fluxos_company_id ON fluxos(company_id);
CREATE INDEX IF NOT EXISTS idx_fluxos_status ON fluxos(status);
CREATE INDEX IF NOT EXISTS idx_fluxos_tipo ON fluxos(tipo);
CREATE INDEX IF NOT EXISTS idx_fluxos_n8n_workflow_id ON fluxos(n8n_workflow_id);

CREATE INDEX IF NOT EXISTS idx_execucoes_fluxo_tenant_id ON execucoes_fluxo(tenant_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_fluxo_fluxo_id ON execucoes_fluxo(fluxo_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_fluxo_status ON execucoes_fluxo(status);
CREATE INDEX IF NOT EXISTS idx_execucoes_fluxo_created_at ON execucoes_fluxo(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_templates_fluxo_categoria ON templates_fluxo(categoria);
CREATE INDEX IF NOT EXISTS idx_templates_fluxo_tipo ON templates_fluxo(tipo);

-- ============================================
-- TRIGGERS para updated_at
-- ============================================
CREATE TRIGGER IF NOT EXISTS update_fluxos_updated_at
    BEFORE UPDATE ON fluxos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_templates_fluxo_updated_at
    BEFORE UPDATE ON templates_fluxo
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Insert default templates
-- ============================================
INSERT INTO templates_fluxo (nome, descricao, categoria, tipo, icone, nodes, edges) VALUES
('Boas-vindas WhatsApp', 'Envia mensagem de boas-vindas quando um novo contato inicia conversa', 'onboarding', 'chatbot', 'MessageCircle', '[]', '[]'),
('Notificação de Lead', 'Notifica equipe quando um novo lead é identificado', 'notification', 'notification', 'Bell', '[]', '[]'),
('Integração CRM', 'Sincroniza contatos com seu CRM', 'integration', 'integration', 'Database', '[]', '[]'),
('FAQ Automático', 'Responde perguntas frequentes automaticamente', 'support', 'chatbot', 'HelpCircle', '[]', '[]'),
('Agendamento', 'Permite clientes agendarem horários automaticamente', 'scheduling', 'automation', 'Calendar', '[]', '[]')
ON CONFLICT DO NOTHING;
