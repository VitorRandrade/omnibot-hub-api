import { db } from '../../config/database.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { CreateAgentDTO, UpdateAgentDTO } from './agents.dto.js';

// Interface que reflete o schema existente na VPS
interface AgentDB {
  id: string;
  tenant_id: string;
  nome: string;
  tipo: string;
  status: string;
  descricao: string | null;
  mcp_key: string | null;
  configuracoes: Record<string, any> | null;
  metricas: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

// Interface para resposta da API (compatível com frontend)
interface AgentResponse {
  id: string;
  user_id: string; // Mapeado de tenant_id
  name: string; // Mapeado de nome
  type: string; // Mapeado de tipo
  avatar: string | null;
  status: string;
  description: string | null; // Mapeado de descricao
  system_prompt: string | null; // Extraído de configuracoes
  model: string; // Extraído de configuracoes
  temperature: number; // Extraído de configuracoes
  max_tokens: number; // Extraído de configuracoes
  total_conversations: number; // Extraído de metricas
  satisfaction_rate: number; // Extraído de metricas
  created_at: Date;
  updated_at: Date;
  channels?: string[];
}

interface ListParams {
  userId: string;
  page: number;
  perPage: number;
  status?: string;
  search?: string;
}

// Função helper para mapear do banco para resposta da API
function mapAgentToResponse(agent: AgentDB): AgentResponse {
  const config = agent.configuracoes || {};
  const metrics = agent.metricas || {};

  return {
    id: agent.id,
    user_id: agent.tenant_id,
    name: agent.nome,
    type: agent.tipo,
    avatar: agent.nome?.substring(0, 2).toUpperCase() || 'AG',
    status: agent.status,
    description: agent.descricao,
    system_prompt: config.system_prompt || null,
    model: config.model || 'gpt-4',
    temperature: config.temperature || 0.7,
    max_tokens: config.max_tokens || 1000,
    total_conversations: metrics.total_conversations || 0,
    satisfaction_rate: metrics.satisfaction_rate || 0,
    created_at: agent.created_at,
    updated_at: agent.updated_at,
  };
}

export class AgentsService {
  async list(params: ListParams): Promise<{ agents: AgentResponse[]; total: number }> {
    const { userId, page, perPage, status, search } = params;
    const offset = (page - 1) * perPage;

    // Primeiro, obter o tenant_id do usuário
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return { agents: [], total: 0 };
    }
    const tenantId = userResult.rows[0].tenant_id;

    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (search) {
      conditions.push(`nome ILIKE $${paramIndex++}`);
      values.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM agents WHERE ${whereClause}`,
      values
    );

    const result = await db.query<AgentDB>(
      `SELECT * FROM agents
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, perPage, offset]
    );

    return {
      agents: result.rows.map(mapAgentToResponse),
      total: parseInt(countResult.rows[0].count),
    };
  }

  async getById(id: string, userId: string): Promise<AgentResponse> {
    // Obter tenant_id do usuário
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('Agent');
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query<AgentDB>(
      `SELECT * FROM agents WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    return mapAgentToResponse(result.rows[0]);
  }

  async create(userId: string, data: CreateAgentDTO): Promise<AgentResponse> {
    // Obter tenant_id do usuário
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    // Montar configuracoes e metricas
    const configuracoes = {
      system_prompt: data.systemPrompt || null,
      model: data.model || 'gpt-4',
      temperature: data.temperature || 0.7,
      max_tokens: data.maxTokens || 1000,
    };

    const metricas = {
      total_conversations: 0,
      satisfaction_rate: 0,
    };

    const result = await db.query<AgentDB>(
      `INSERT INTO agents (tenant_id, nome, tipo, status, descricao, configuracoes, metricas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        data.name,
        'assistant', // tipo padrão
        'offline',
        data.description || null,
        JSON.stringify(configuracoes),
        JSON.stringify(metricas),
      ]
    );

    return mapAgentToResponse(result.rows[0]);
  }

  async update(id: string, userId: string, data: UpdateAgentDTO): Promise<AgentResponse> {
    // Primeiro, buscar o agente atual
    const current = await this.getById(id, userId);

    // Obter tenant_id
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    const tenantId = userResult.rows[0].tenant_id;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`nome = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.description !== undefined) {
      updates.push(`descricao = $${paramIndex++}`);
      values.push(data.description);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    // Atualizar configuracoes se algum campo relacionado foi alterado
    if (data.systemPrompt !== undefined || data.model !== undefined ||
        data.temperature !== undefined || data.maxTokens !== undefined) {
      const newConfig = {
        system_prompt: data.systemPrompt ?? current.system_prompt,
        model: data.model ?? current.model,
        temperature: data.temperature ?? current.temperature,
        max_tokens: data.maxTokens ?? current.max_tokens,
      };
      updates.push(`configuracoes = $${paramIndex++}`);
      values.push(JSON.stringify(newConfig));
    }

    if (updates.length === 0) {
      return current;
    }

    values.push(id, tenantId);

    const result = await db.query<AgentDB>(
      `UPDATE agents SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    return mapAgentToResponse(result.rows[0]);
  }

  async updateStatus(id: string, userId: string, status: string): Promise<AgentResponse> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query<AgentDB>(
      `UPDATE agents SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [status, id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    return mapAgentToResponse(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<void> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query(
      'DELETE FROM agents WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }
  }

  async getStats(userId: string): Promise<any> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return { total: 0, online: 0, totalConversations: 0, avgSatisfaction: 0 };
    }
    const tenantId = userResult.rows[0].tenant_id;

    try {
      const result = await db.query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'online')::int as online
         FROM agents WHERE tenant_id = $1`,
        [tenantId]
      );

      const row = result.rows[0];
      return {
        total: row.total || 0,
        online: row.online || 0,
        totalConversations: 0,
        avgSatisfaction: 0,
      };
    } catch (error) {
      console.error('Error getting agent stats:', error);
      return { total: 0, online: 0, totalConversations: 0, avgSatisfaction: 0 };
    }
  }

  // Endpoint para n8n/webhooks buscarem agente por mcp_key
  async getByMcpKey(mcpKey: string): Promise<AgentResponse | null> {
    const result = await db.query<AgentDB>(
      'SELECT * FROM agents WHERE mcp_key = $1',
      [mcpKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapAgentToResponse(result.rows[0]);
  }
}

export const agentsService = new AgentsService();
