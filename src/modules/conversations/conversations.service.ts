import { db } from '../../config/database.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { CreateConversationDTO, AssignAgentDTO } from './conversations.schema.js';

// Interface que reflete o schema da tabela conversas no banco (PT)
interface ConversationDB {
  id: string;
  tenant_id: string;
  company_id: string | null;
  cliente_id: string;
  agente_id: string | null;
  canal: string;
  status: string;
  ultima_mensagem: string | null;
  ultima_atividade: Date;
  metadata: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

// Interface para resposta da API (EN)
interface ConversationResponse {
  id: string;
  tenant_id: string;
  company_id: string | null;
  customer_id: string;
  agent_id: string | null;
  channel: string;
  status: string;
  last_message: string | null;
  last_activity: Date;
  metadata: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
  // Campos expandidos (se joined)
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    avatar: string | null;
  };
  agent?: {
    id: string;
    name: string;
    avatar: string | null;
  };
  unread_count?: number;
}

interface ListParams {
  userId: string;
  page: number;
  perPage: number;
  status?: string;
  channel?: string;
  agentId?: string;
  customerId?: string;
  search?: string;
}

// Mapeamento de status PT -> EN
const statusPtToEn: Record<string, string> = {
  'aberta': 'open',
  'em_atendimento': 'in_progress',
  'resolvida': 'resolved',
  'fechada': 'closed',
  // Aceitar valores já em inglês
  'open': 'open',
  'in_progress': 'in_progress',
  'resolved': 'resolved',
  'closed': 'closed',
};

// Mapeamento de status EN -> PT
const statusEnToPt: Record<string, string> = {
  'open': 'aberta',
  'in_progress': 'em_atendimento',
  'resolved': 'resolvida',
  'closed': 'fechada',
};

function mapStatusToEn(status: string): string {
  return statusPtToEn[status?.toLowerCase()] || status || 'open';
}

function mapStatusToPt(status: string): string {
  return statusEnToPt[status?.toLowerCase()] || status || 'aberta';
}

// Helper para obter tenant_id do usuário
async function getTenantId(userId: string): Promise<string | null> {
  const result = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0].tenant_id : null;
}

// Mapear do banco para resposta da API
function mapConversationToResponse(conv: any): ConversationResponse {
  return {
    id: conv.id,
    tenant_id: conv.tenant_id,
    company_id: conv.company_id,
    customer_id: conv.cliente_id || conv.customer_id,
    agent_id: conv.agente_id || conv.agent_id,
    channel: conv.canal || conv.channel,
    status: mapStatusToEn(conv.status),
    last_message: conv.ultima_mensagem || conv.last_message,
    last_activity: conv.ultima_atividade || conv.last_activity || conv.updated_at,
    metadata: conv.metadata,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    customer: conv.customer_name ? {
      id: conv.cliente_id || conv.customer_id,
      name: conv.customer_name,
      phone: conv.customer_phone,
      email: conv.customer_email,
      avatar: conv.customer_avatar,
    } : undefined,
    agent: conv.agent_name ? {
      id: conv.agente_id || conv.agent_id,
      name: conv.agent_name,
      avatar: conv.agent_avatar,
    } : undefined,
    unread_count: conv.unread_count,
  };
}

export class ConversationsService {
  async list(params: ListParams): Promise<{ conversations: ConversationResponse[]; total: number }> {
    const { userId, page, perPage, status, channel, agentId, customerId, search } = params;
    const offset = (page - 1) * perPage;

    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { conversations: [], total: 0 };
    }

    const conditions: string[] = ['c.tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`c.status = $${paramIndex++}`);
      values.push(mapStatusToPt(status));
    }

    if (channel) {
      conditions.push(`c.canal = $${paramIndex++}`);
      values.push(channel);
    }

    if (agentId) {
      conditions.push(`c.agente_id = $${paramIndex++}`);
      values.push(agentId);
    }

    if (customerId) {
      conditions.push(`c.cliente_id = $${paramIndex++}`);
      values.push(customerId);
    }

    if (search) {
      conditions.push(`(ct.nome ILIKE $${paramIndex} OR ct.telefone ILIKE $${paramIndex} OR c.ultima_mensagem ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    try {
      const countResult = await db.query(
        `SELECT COUNT(*) FROM conversas c
         LEFT JOIN contatos ct ON c.cliente_id = ct.id
         WHERE ${whereClause}`,
        values
      );

      // Query principal com JOINs para obter dados do cliente e agente
      // OPTIMIZED: Using LEFT JOIN with aggregated subquery instead of N+1 correlated subquery
      const result = await db.query(
        `SELECT
          c.*,
          ct.nome as customer_name,
          ct.telefone as customer_phone,
          ct.email as customer_email,
          ct.avatar as customer_avatar,
          a.nome as agent_name,
          COALESCE(a.nome, 'AG') as agent_avatar,
          COALESCE(unread.count, 0) as unread_count
         FROM conversas c
         LEFT JOIN contatos ct ON c.cliente_id = ct.id
         LEFT JOIN agents a ON c.agente_id = a.id
         LEFT JOIN (
           SELECT conversa_id, COUNT(*)::int as count
           FROM mensagens
           WHERE lida = false AND remetente_tipo = 'customer'
           GROUP BY conversa_id
         ) unread ON unread.conversa_id = c.id
         WHERE ${whereClause}
         ORDER BY c.ultima_atividade DESC NULLS LAST, c.updated_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, perPage, offset]
      );

      return {
        conversations: result.rows.map(mapConversationToResponse),
        total: parseInt(countResult.rows[0].count),
      };
    } catch (dbError: any) {
      // Se tabela não existe, retornar vazio
      if (dbError.code === '42P01') {
        return { conversations: [], total: 0 };
      }
      throw dbError;
    }
  }

  async getById(id: string, userId: string): Promise<ConversationResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('Conversation');
    }

    try {
      const result = await db.query(
        `SELECT
          c.*,
          ct.nome as customer_name,
          ct.telefone as customer_phone,
          ct.email as customer_email,
          ct.avatar as customer_avatar,
          a.nome as agent_name,
          COALESCE(a.nome, 'AG') as agent_avatar,
          (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id AND m.lida = false AND m.remetente_tipo = 'customer') as unread_count
         FROM conversas c
         LEFT JOIN contatos ct ON c.cliente_id = ct.id
         LEFT JOIN agents a ON c.agente_id = a.id
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation');
      }

      return mapConversationToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Conversation');
      }
      throw dbError;
    }
  }

  async create(userId: string, data: CreateConversationDTO): Promise<ConversationResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      const result = await db.query<ConversationDB>(
        `INSERT INTO conversas (tenant_id, company_id, cliente_id, agente_id, canal, status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'aberta', $6)
         RETURNING *`,
        [
          tenantId,
          data.companyId || null,
          data.customerId,
          data.agentId || null,
          data.channel,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ]
      );

      return this.getById(result.rows[0].id, userId);
    } catch (dbError: any) {
      if (dbError.code === '42P01' || dbError.code === '42703') {
        // Fallback para nomes em inglês
        const result = await db.query(
          `INSERT INTO conversations (tenant_id, company_id, customer_id, agent_id, channel, status, metadata)
           VALUES ($1, $2, $3, $4, $5, 'open', $6)
           RETURNING *`,
          [
            tenantId,
            data.companyId || null,
            data.customerId,
            data.agentId || null,
            data.channel,
            data.metadata ? JSON.stringify(data.metadata) : null,
          ]
        );
        return mapConversationToResponse(result.rows[0]);
      }
      throw dbError;
    }
  }

  async updateStatus(id: string, userId: string, status: string): Promise<ConversationResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    const dbStatus = mapStatusToPt(status);

    try {
      const result = await db.query<ConversationDB>(
        `UPDATE conversas
         SET status = $1, updated_at = NOW(), ultima_atividade = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [dbStatus, id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation');
      }

      return this.getById(id, userId);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Conversation');
      }
      throw dbError;
    }
  }

  async assignAgent(id: string, userId: string, data: AssignAgentDTO): Promise<ConversationResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      const result = await db.query<ConversationDB>(
        `UPDATE conversas
         SET agente_id = $1, status = 'em_atendimento', updated_at = NOW(), ultima_atividade = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [data.agentId, id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation');
      }

      return this.getById(id, userId);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Conversation');
      }
      throw dbError;
    }
  }

  async close(id: string, userId: string): Promise<ConversationResponse> {
    return this.updateStatus(id, userId, 'closed');
  }

  async getStats(userId: string): Promise<any> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0, unread: 0 };
    }

    try {
      const result = await db.query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'aberta' OR status = 'open')::int as open,
          COUNT(*) FILTER (WHERE status = 'em_atendimento' OR status = 'in_progress')::int as in_progress,
          COUNT(*) FILTER (WHERE status = 'resolvida' OR status = 'resolved')::int as resolved,
          COUNT(*) FILTER (WHERE status = 'fechada' OR status = 'closed')::int as closed
         FROM conversas WHERE tenant_id = $1`,
        [tenantId]
      );

      // Contar mensagens não lidas
      const unreadResult = await db.query(
        `SELECT COUNT(*)::int as unread
         FROM mensagens m
         JOIN conversas c ON m.conversa_id = c.id
         WHERE c.tenant_id = $1 AND m.lida = false AND m.remetente_tipo = 'customer'`,
        [tenantId]
      );

      const row = result.rows[0];
      return {
        total: row.total || 0,
        open: row.open || 0,
        inProgress: row.in_progress || 0,
        resolved: row.resolved || 0,
        closed: row.closed || 0,
        unread: unreadResult.rows[0]?.unread || 0,
      };
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0, unread: 0 };
      }
      throw dbError;
    }
  }

  // Para n8n/webhooks - buscar por tenant_id direto
  async getByTenantId(tenantId: string, conversationId: string): Promise<ConversationResponse | null> {
    try {
      const result = await db.query(
        `SELECT
          c.*,
          ct.nome as customer_name,
          ct.telefone as customer_phone,
          ct.email as customer_email,
          a.nome as agent_name
         FROM conversas c
         LEFT JOIN contatos ct ON c.cliente_id = ct.id
         LEFT JOIN agents a ON c.agente_id = a.id
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [conversationId, tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapConversationToResponse(result.rows[0]);
    } catch {
      return null;
    }
  }

  // Atualizar última mensagem da conversa
  async updateLastMessage(conversationId: string, message: string): Promise<void> {
    try {
      await db.query(
        `UPDATE conversas
         SET ultima_mensagem = $1, ultima_atividade = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [message, conversationId]
      );
    } catch {
      // Silently fail - not critical
    }
  }
}

export const conversationsService = new ConversationsService();
