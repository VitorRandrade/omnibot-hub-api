import { db } from '../../config/database.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { CreateMessageDTO } from './messages.schema.js';
import { conversationsService } from '../conversations/conversations.service.js';
import { emitNewMessage } from '../../config/socket.js';

// Interface que reflete o schema da tabela mensagens no banco (PT)
interface MessageDB {
  id: string;
  tenant_id: string;
  conversa_id: string;
  remetente_tipo: string;
  remetente_id: string | null;
  conteudo: string;
  tipo: string;
  metadata: Record<string, any> | null;
  lida: boolean;
  resposta_para: string | null;
  created_at: Date;
}

// Interface para resposta da API (EN)
interface MessageResponse {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  type: string;
  metadata: Record<string, any> | null;
  read: boolean;
  reply_to_id: string | null;
  created_at: Date;
  // Campos expandidos
  sender?: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

interface ListParams {
  userId: string;
  conversationId: string;
  page: number;
  perPage: number;
  before?: string;
  after?: string;
}

// Helper para obter tenant_id do usuário
async function getTenantId(userId: string): Promise<string | null> {
  const result = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0].tenant_id : null;
}

// Mapeamento de tipos de remetente PT -> EN
const senderTypePtToEn: Record<string, string> = {
  'cliente': 'customer',
  'agente': 'agent',
  'sistema': 'system',
  'bot': 'bot',
  'customer': 'customer',
  'agent': 'agent',
  'system': 'system',
};

// Mapeamento de tipos de remetente EN -> PT
const senderTypeEnToPt: Record<string, string> = {
  'customer': 'cliente',
  'agent': 'agente',
  'system': 'sistema',
  'bot': 'bot',
};

function mapSenderTypeToEn(type: string): string {
  return senderTypePtToEn[type?.toLowerCase()] || type || 'system';
}

function mapSenderTypeToPt(type: string): string {
  return senderTypeEnToPt[type?.toLowerCase()] || type || 'sistema';
}

// Mapear do banco para resposta da API
function mapMessageToResponse(msg: any): MessageResponse {
  return {
    id: msg.id,
    tenant_id: msg.tenant_id,
    conversation_id: msg.conversa_id || msg.conversation_id,
    sender_type: mapSenderTypeToEn(msg.remetente_tipo || msg.sender_type),
    sender_id: msg.remetente_id || msg.sender_id,
    content: msg.conteudo || msg.content,
    type: msg.tipo || msg.type || 'text',
    metadata: msg.metadata,
    read: msg.lida ?? msg.read ?? false,
    reply_to_id: msg.resposta_para || msg.reply_to_id,
    created_at: msg.created_at,
    sender: msg.sender_name ? {
      id: msg.remetente_id || msg.sender_id,
      name: msg.sender_name,
      avatar: msg.sender_avatar,
    } : undefined,
  };
}

export class MessagesService {
  async listByConversation(params: ListParams): Promise<{ messages: MessageResponse[]; total: number }> {
    const { userId, conversationId, page, perPage, before, after } = params;
    const offset = (page - 1) * perPage;

    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { messages: [], total: 0 };
    }

    // Verificar se a conversa pertence ao tenant
    const convCheck = await db.query(
      'SELECT id FROM conversas WHERE id = $1 AND tenant_id = $2',
      [conversationId, tenantId]
    );

    if (convCheck.rows.length === 0) {
      throw new NotFoundError('Conversation');
    }

    const conditions: string[] = ['m.conversa_id = $1', 'm.tenant_id = $2'];
    const values: any[] = [conversationId, tenantId];
    let paramIndex = 3;

    if (before) {
      conditions.push(`m.created_at < $${paramIndex++}`);
      values.push(before);
    }

    if (after) {
      conditions.push(`m.created_at > $${paramIndex++}`);
      values.push(after);
    }

    const whereClause = conditions.join(' AND ');

    try {
      const countResult = await db.query(
        `SELECT COUNT(*) FROM mensagens m WHERE ${whereClause}`,
        values
      );

      // Query principal com informações do remetente
      const result = await db.query(
        `SELECT
          m.*,
          CASE
            WHEN m.remetente_tipo = 'cliente' OR m.remetente_tipo = 'customer' THEN ct.nome
            WHEN m.remetente_tipo = 'agente' OR m.remetente_tipo = 'agent' THEN a.nome
            ELSE 'Sistema'
          END as sender_name,
          CASE
            WHEN m.remetente_tipo = 'cliente' OR m.remetente_tipo = 'customer' THEN ct.avatar
            WHEN m.remetente_tipo = 'agente' OR m.remetente_tipo = 'agent' THEN COALESCE(a.nome, 'AG')
            ELSE NULL
          END as sender_avatar
         FROM mensagens m
         LEFT JOIN contatos ct ON m.remetente_id = ct.id AND (m.remetente_tipo = 'cliente' OR m.remetente_tipo = 'customer')
         LEFT JOIN agents a ON m.remetente_id = a.id AND (m.remetente_tipo = 'agente' OR m.remetente_tipo = 'agent')
         WHERE ${whereClause}
         ORDER BY m.created_at ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, perPage, offset]
      );

      return {
        messages: result.rows.map(mapMessageToResponse),
        total: parseInt(countResult.rows[0].count),
      };
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return { messages: [], total: 0 };
      }
      throw dbError;
    }
  }

  async create(userId: string, data: CreateMessageDTO): Promise<MessageResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    // Verificar se a conversa existe e pertence ao tenant
    const convCheck = await db.query(
      'SELECT id FROM conversas WHERE id = $1 AND tenant_id = $2',
      [data.conversationId, tenantId]
    );

    if (convCheck.rows.length === 0) {
      throw new NotFoundError('Conversation');
    }

    const senderTypePt = mapSenderTypeToPt(data.senderType);

    try {
      const result = await db.query<MessageDB>(
        `INSERT INTO mensagens (tenant_id, conversa_id, remetente_tipo, remetente_id, conteudo, tipo, metadata, resposta_para, lida)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          tenantId,
          data.conversationId,
          senderTypePt,
          data.senderId || null,
          data.content,
          data.type || 'text',
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.replyToId || null,
          data.senderType === 'customer' ? false : true, // Mensagens do cliente começam como não lidas
        ]
      );

      // Atualizar última mensagem da conversa
      await conversationsService.updateLastMessage(
        data.conversationId,
        data.content.substring(0, 100) // Truncar para 100 caracteres
      );

      const messageResponse = mapMessageToResponse(result.rows[0]);

      // Emit socket event for real-time updates
      emitNewMessage(tenantId, data.conversationId, messageResponse);

      return messageResponse;
    } catch (dbError: any) {
      if (dbError.code === '42P01' || dbError.code === '42703') {
        // Fallback para nomes em inglês
        const result = await db.query(
          `INSERT INTO messages (tenant_id, conversation_id, sender_type, sender_id, content, type, metadata, reply_to_id, read)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            tenantId,
            data.conversationId,
            data.senderType,
            data.senderId || null,
            data.content,
            data.type || 'text',
            data.metadata ? JSON.stringify(data.metadata) : null,
            data.replyToId || null,
            data.senderType === 'customer' ? false : true,
          ]
        );
        return mapMessageToResponse(result.rows[0]);
      }
      throw dbError;
    }
  }

  async markAsRead(userId: string, conversationId: string, messageIds?: string[]): Promise<number> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    try {
      let result;

      if (messageIds && messageIds.length > 0) {
        // Marcar mensagens específicas como lidas
        result = await db.query(
          `UPDATE mensagens
           SET lida = true
           WHERE conversa_id = $1 AND tenant_id = $2 AND id = ANY($3) AND lida = false
           RETURNING id`,
          [conversationId, tenantId, messageIds]
        );
      } else {
        // Marcar todas as mensagens da conversa como lidas
        result = await db.query(
          `UPDATE mensagens
           SET lida = true
           WHERE conversa_id = $1 AND tenant_id = $2 AND lida = false AND remetente_tipo IN ('cliente', 'customer')
           RETURNING id`,
          [conversationId, tenantId]
        );
      }

      return result.rows.length;
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return 0;
      }
      throw dbError;
    }
  }

  async getById(id: string, userId: string): Promise<MessageResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('Message');
    }

    try {
      const result = await db.query(
        `SELECT
          m.*,
          CASE
            WHEN m.remetente_tipo = 'cliente' OR m.remetente_tipo = 'customer' THEN ct.nome
            WHEN m.remetente_tipo = 'agente' OR m.remetente_tipo = 'agent' THEN a.nome
            ELSE 'Sistema'
          END as sender_name
         FROM mensagens m
         LEFT JOIN contatos ct ON m.remetente_id = ct.id
         LEFT JOIN agents a ON m.remetente_id = a.id
         WHERE m.id = $1 AND m.tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Message');
      }

      return mapMessageToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Message');
      }
      throw dbError;
    }
  }

  // Para n8n/webhooks - criar mensagem por tenant_id direto
  async createByTenantId(
    tenantId: string,
    conversationId: string,
    data: {
      senderType: string;
      senderId?: string;
      content: string;
      type?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<MessageResponse | null> {
    const senderTypePt = mapSenderTypeToPt(data.senderType);

    try {
      const result = await db.query<MessageDB>(
        `INSERT INTO mensagens (tenant_id, conversa_id, remetente_tipo, remetente_id, conteudo, tipo, metadata, lida)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tenantId,
          conversationId,
          senderTypePt,
          data.senderId || null,
          data.content,
          data.type || 'text',
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.senderType === 'customer' ? false : true,
        ]
      );

      // Atualizar última mensagem
      await db.query(
        `UPDATE conversas SET ultima_mensagem = $1, ultima_atividade = NOW() WHERE id = $2`,
        [data.content.substring(0, 100), conversationId]
      );

      const messageResponse = mapMessageToResponse(result.rows[0]);

      // Emit socket event for real-time updates
      emitNewMessage(tenantId, conversationId, messageResponse);

      return messageResponse;
    } catch {
      return null;
    }
  }

  // Obter contagem de mensagens não lidas por conversa
  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return 0;
    }

    try {
      const result = await db.query(
        `SELECT COUNT(*)::int as count
         FROM mensagens
         WHERE conversa_id = $1 AND tenant_id = $2 AND lida = false AND remetente_tipo IN ('cliente', 'customer')`,
        [conversationId, tenantId]
      );

      return result.rows[0]?.count || 0;
    } catch {
      return 0;
    }
  }
}

export const messagesService = new MessagesService();
