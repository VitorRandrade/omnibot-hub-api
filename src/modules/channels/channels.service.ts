import { db } from '../../config/database.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { CreateChannelDTO, UpdateChannelDTO } from './channels.schema.js';

// Interface que reflete o schema da tabela canais no banco (PT)
interface ChannelDB {
  id: string;
  tenant_id: string;
  tipo: string;
  nome: string;
  descricao: string | null;
  status: string;
  meta_oficial: boolean;
  credenciais: Record<string, any> | null;
  configuracoes: Record<string, any> | null;
  webhook_url: string | null;
  ultima_conexao: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Interface para resposta da API (EN)
interface ChannelResponse {
  id: string;
  tenant_id: string;
  type: string;
  name: string;
  description: string | null;
  status: string;
  is_meta_official: boolean;
  webhook_url: string | null;
  last_connected_at: string | null;
  settings: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  // Stats expandidos
  total_conversations?: number;
  active_conversations?: number;
}

interface ListParams {
  userId: string;
  page: number;
  perPage: number;
  type?: string;
  status?: string;
  search?: string;
}

// Mapeamento de status PT -> EN
const statusPtToEn: Record<string, string> = {
  'conectado': 'connected',
  'desconectado': 'disconnected',
  'pendente': 'pending',
  'erro': 'error',
  'connected': 'connected',
  'disconnected': 'disconnected',
  'pending': 'pending',
  'error': 'error',
};

// Mapeamento de status EN -> PT
const statusEnToPt: Record<string, string> = {
  'connected': 'conectado',
  'disconnected': 'desconectado',
  'pending': 'pendente',
  'error': 'erro',
};

function mapStatusToEn(status: string): string {
  return statusPtToEn[status?.toLowerCase()] || status || 'disconnected';
}

function mapStatusToPt(status: string): string {
  return statusEnToPt[status?.toLowerCase()] || status || 'desconectado';
}

// Helper para obter tenant_id do usuário
async function getTenantId(userId: string): Promise<string | null> {
  const result = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0].tenant_id : null;
}

// Mapear do banco para resposta da API
function mapChannelToResponse(channel: any): ChannelResponse {
  return {
    id: channel.id,
    tenant_id: channel.tenant_id,
    type: channel.tipo || channel.type,
    name: channel.nome || channel.name,
    description: channel.descricao || channel.description,
    status: mapStatusToEn(channel.status),
    is_meta_official: channel.meta_oficial ?? channel.is_meta_official ?? false,
    webhook_url: channel.webhook_url,
    last_connected_at: channel.ultima_conexao || channel.last_connected_at,
    settings: channel.configuracoes || channel.settings,
    created_at: channel.created_at,
    updated_at: channel.updated_at,
    total_conversations: channel.total_conversations,
    active_conversations: channel.active_conversations,
  };
}

export class ChannelsService {
  async list(params: ListParams): Promise<{ channels: ChannelResponse[]; total: number }> {
    const { userId, page, perPage, type, status, search } = params;
    const offset = (page - 1) * perPage;

    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { channels: [], total: 0 };
    }

    const conditions: string[] = ['c.tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (type) {
      conditions.push(`c.tipo = $${paramIndex++}`);
      values.push(type);
    }

    if (status) {
      conditions.push(`c.status = $${paramIndex++}`);
      values.push(mapStatusToPt(status));
    }

    if (search) {
      conditions.push(`c.nome ILIKE $${paramIndex++}`);
      values.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    try {
      const countResult = await db.query(
        `SELECT COUNT(*) FROM canais c WHERE ${whereClause}`,
        values
      );

      // Query principal com stats
      const result = await db.query(
        `SELECT
          c.*,
          (SELECT COUNT(*) FROM conversas conv WHERE conv.canal = c.tipo AND conv.tenant_id = c.tenant_id) as total_conversations,
          (SELECT COUNT(*) FROM conversas conv WHERE conv.canal = c.tipo AND conv.tenant_id = c.tenant_id AND conv.status IN ('aberta', 'em_atendimento')) as active_conversations
         FROM canais c
         WHERE ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, perPage, offset]
      );

      return {
        channels: result.rows.map(mapChannelToResponse),
        total: parseInt(countResult.rows[0].count),
      };
    } catch (dbError: any) {
      // Se tabela não existe, tentar com nome em inglês
      if (dbError.code === '42P01') {
        try {
          const countResult = await db.query(
            `SELECT COUNT(*) FROM channels WHERE tenant_id = $1`,
            [tenantId]
          );

          const result = await db.query(
            `SELECT * FROM channels WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [tenantId, perPage, offset]
          );

          return {
            channels: result.rows.map(mapChannelToResponse),
            total: parseInt(countResult.rows[0].count),
          };
        } catch {
          return { channels: [], total: 0 };
        }
      }
      throw dbError;
    }
  }

  async getById(id: string, userId: string): Promise<ChannelResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('Channel');
    }

    try {
      const result = await db.query(
        `SELECT
          c.*,
          (SELECT COUNT(*) FROM conversas conv WHERE conv.canal = c.tipo AND conv.tenant_id = c.tenant_id) as total_conversations,
          (SELECT COUNT(*) FROM conversas conv WHERE conv.canal = c.tipo AND conv.tenant_id = c.tenant_id AND conv.status IN ('aberta', 'em_atendimento')) as active_conversations
         FROM canais c
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Channel');
      }

      return mapChannelToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        const result = await db.query(
          'SELECT * FROM channels WHERE id = $1 AND tenant_id = $2',
          [id, tenantId]
        );
        if (result.rows.length === 0) {
          throw new NotFoundError('Channel');
        }
        return mapChannelToResponse(result.rows[0]);
      }
      throw dbError;
    }
  }

  async create(userId: string, data: CreateChannelDTO): Promise<ChannelResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      const result = await db.query<ChannelDB>(
        `INSERT INTO canais (tenant_id, tipo, nome, descricao, status, meta_oficial, credenciais, configuracoes)
         VALUES ($1, $2, $3, $4, 'desconectado', $5, $6, $7)
         RETURNING *`,
        [
          tenantId,
          data.type,
          data.name,
          data.description || null,
          data.isMetaOfficial || false,
          data.credentials ? JSON.stringify(data.credentials) : null,
          data.settings ? JSON.stringify(data.settings) : null,
        ]
      );

      return mapChannelToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01' || dbError.code === '42703') {
        const result = await db.query(
          `INSERT INTO channels (tenant_id, type, name, description, status, is_meta_official, credentials, settings)
           VALUES ($1, $2, $3, $4, 'disconnected', $5, $6, $7)
           RETURNING *`,
          [
            tenantId,
            data.type,
            data.name,
            data.description || null,
            data.isMetaOfficial || false,
            data.credentials ? JSON.stringify(data.credentials) : null,
            data.settings ? JSON.stringify(data.settings) : null,
          ]
        );
        return mapChannelToResponse(result.rows[0]);
      }
      throw dbError;
    }
  }

  async update(id: string, userId: string, data: UpdateChannelDTO): Promise<ChannelResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    // Verificar se canal existe
    await this.getById(id, userId);

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
      values.push(mapStatusToPt(data.status));
    }

    if (data.credentials !== undefined) {
      updates.push(`credenciais = $${paramIndex++}`);
      values.push(JSON.stringify(data.credentials));
    }

    if (data.settings !== undefined) {
      updates.push(`configuracoes = $${paramIndex++}`);
      values.push(JSON.stringify(data.settings));
    }

    if (updates.length === 0) {
      return this.getById(id, userId);
    }

    values.push(id, tenantId);

    try {
      const result = await db.query<ChannelDB>(
        `UPDATE canais SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Channel');
      }

      return mapChannelToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Channel');
      }
      throw dbError;
    }
  }

  async connect(id: string, userId: string): Promise<ChannelResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      const result = await db.query<ChannelDB>(
        `UPDATE canais
         SET status = 'conectado', ultima_conexao = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Channel');
      }

      return mapChannelToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        const result = await db.query(
          `UPDATE channels SET status = 'connected', last_connected_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2 RETURNING *`,
          [id, tenantId]
        );
        if (result.rows.length === 0) {
          throw new NotFoundError('Channel');
        }
        return mapChannelToResponse(result.rows[0]);
      }
      throw dbError;
    }
  }

  async disconnect(id: string, userId: string): Promise<ChannelResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      const result = await db.query<ChannelDB>(
        `UPDATE canais
         SET status = 'desconectado', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Channel');
      }

      return mapChannelToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        const result = await db.query(
          `UPDATE channels SET status = 'disconnected', updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2 RETURNING *`,
          [id, tenantId]
        );
        if (result.rows.length === 0) {
          throw new NotFoundError('Channel');
        }
        return mapChannelToResponse(result.rows[0]);
      }
      throw dbError;
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      const result = await db.query(
        'DELETE FROM canais WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Channel');
      }
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        const result = await db.query(
          'DELETE FROM channels WHERE id = $1 AND tenant_id = $2 RETURNING id',
          [id, tenantId]
        );
        if (result.rows.length === 0) {
          throw new NotFoundError('Channel');
        }
      } else {
        throw dbError;
      }
    }
  }

  async getStats(userId: string): Promise<any> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { total: 0, connected: 0, disconnected: 0, byType: {} };
    }

    try {
      const result = await db.query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'conectado' OR status = 'connected')::int as connected,
          COUNT(*) FILTER (WHERE status = 'desconectado' OR status = 'disconnected')::int as disconnected
         FROM canais WHERE tenant_id = $1`,
        [tenantId]
      );

      const byTypeResult = await db.query(
        `SELECT tipo as type, COUNT(*)::int as count
         FROM canais WHERE tenant_id = $1 GROUP BY tipo`,
        [tenantId]
      );

      const byType: Record<string, number> = {};
      byTypeResult.rows.forEach(row => {
        byType[row.type] = row.count;
      });

      const row = result.rows[0];
      return {
        total: row.total || 0,
        connected: row.connected || 0,
        disconnected: row.disconnected || 0,
        byType,
      };
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return { total: 0, connected: 0, disconnected: 0, byType: {} };
      }
      throw dbError;
    }
  }

  // Gerar webhook URL para o canal
  async generateWebhookUrl(id: string, userId: string): Promise<string> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    const channel = await this.getById(id, userId);
    const webhookUrl = `${process.env.API_URL || 'http://localhost:3001'}/v1/webhooks/channels/${channel.type}/${id}`;

    try {
      await db.query(
        'UPDATE canais SET webhook_url = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [webhookUrl, id, tenantId]
      );
    } catch {
      await db.query(
        'UPDATE channels SET webhook_url = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [webhookUrl, id, tenantId]
      );
    }

    return webhookUrl;
  }
}

export const channelsService = new ChannelsService();
