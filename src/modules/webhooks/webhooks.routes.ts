import { Router } from 'express';
import crypto from 'crypto';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';
import { NotFoundError, UnauthorizedError } from '../../shared/middleware/error.middleware.js';

const router = Router();

// Middleware to validate webhook signature from n8n
const validateWebhookSignature = (req: any, res: any, next: any) => {
  const signature = req.headers['x-webhook-signature'] || req.headers['x-webhook-secret'];
  const secret = env.WEBHOOK_SECRET;

  if (!secret) {
    // No secret configured, skip validation
    return next();
  }

  if (!signature) {
    return next(new UnauthorizedError('Missing webhook signature'));
  }

  // Simple secret comparison or HMAC validation
  if (signature === secret) {
    return next();
  }

  // HMAC validation
  if (signature.startsWith('sha256=')) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(req.body));
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return next();
    }
  }

  return next(new UnauthorizedError('Invalid webhook signature'));
};

// ==========================================
// Public webhook endpoints (for n8n)
// ==========================================

// Receive message from n8n (WhatsApp, Instagram, etc.)
router.post('/n8n/message', validateWebhookSignature, async (req, res, next) => {
  try {
    const { channel, from, message, metadata } = req.body;

    console.log('[Webhook] Received message from n8n:', {
      channel,
      from,
      messageType: message?.type,
    });

    // Find or create customer
    let customer = await db.query(
      `SELECT id FROM customers WHERE channel_user_id = $1 AND channel_type = $2`,
      [from?.id, channel]
    );

    let customerId = customer.rows[0]?.id;

    if (!customerId) {
      // Get first user as owner (in production, use proper tenant resolution)
      const adminUser = await db.query('SELECT id FROM users LIMIT 1');
      const userId = adminUser.rows[0]?.id;

      if (userId) {
        const newCustomer = await db.query(
          `INSERT INTO customers (user_id, name, phone, channel_type, channel_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [userId, from?.name, from?.phone, channel, from?.id]
        );
        customerId = newCustomer.rows[0].id;
      }
    }

    // Log the webhook event
    await db.query(
      `INSERT INTO webhook_logs (event_type, payload, success)
       VALUES ($1, $2, true)`,
      ['n8n.message.received', JSON.stringify(req.body)]
    );

    sendSuccess(res, {
      received: true,
      customerId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Receive message from channel via n8n (WhatsApp, Instagram, etc.)
router.post('/channels/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const { from, message, metadata, timestamp } = req.body;

    console.log(`[Webhook] Received message for channel ${type}/${id}:`, {
      from: from?.id || from?.phone,
      messageType: message?.type,
    });

    // Verify channel exists and get tenant_id
    const channelResult = await db.query(
      `SELECT tenant_id FROM canais WHERE id = $1 AND tipo = $2`,
      [id, type]
    );

    if (channelResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { message: 'Channel not found', code: 'CHANNEL_NOT_FOUND' },
      });
      return;
    }

    const tenantId = channelResult.rows[0].tenant_id;

    // Find or create conversation
    let conversation = await db.query(
      `SELECT id FROM conversas WHERE cliente_id = $1 AND canal = $2 AND tenant_id = $3`,
      [from?.id || from?.phone, type, tenantId]
    );

    let conversationId = conversation.rows[0]?.id;

    if (!conversationId) {
      // Create new conversation
      const newConv = await db.query(
        `INSERT INTO conversas (tenant_id, canal, cliente_id, cliente_nome, status)
         VALUES ($1, $2, $3, $4, 'aberta')
         RETURNING id`,
        [tenantId, type, from?.id || from?.phone, from?.name || 'Cliente']
      );
      conversationId = newConv.rows[0].id;
    }

    // Create message
    await db.query(
      `INSERT INTO mensagens (conversa_id, tenant_id, remetente_tipo, conteudo, tipo_mensagem, lida, metadata)
       VALUES ($1, $2, 'customer', $3, $4, false, $5)`,
      [
        conversationId,
        tenantId,
        message?.text || JSON.stringify(message),
        message?.type || 'text',
        JSON.stringify({ ...metadata, timestamp, from }),
      ]
    );

    sendSuccess(res, {
      received: true,
      conversationId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Webhook] Error processing channel message:', error);
    next(error);
  }
});

// Receive generic event from n8n
router.post('/n8n/event', validateWebhookSignature, async (req, res, next) => {
  try {
    const { event, data } = req.body;

    console.log('[Webhook] Received event from n8n:', event);

    // Log the event
    await db.query(
      `INSERT INTO webhook_logs (event_type, payload, success)
       VALUES ($1, $2, true)`,
      [`n8n.${event}`, JSON.stringify(data)]
    );

    sendSuccess(res, {
      received: true,
      event,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Update product from n8n (e.g., stock sync from ERP)
router.post('/n8n/product-update', validateWebhookSignature, async (req, res, next) => {
  try {
    const { sku, updates } = req.body;

    if (!sku) {
      res.status(400).json({
        success: false,
        error: { message: 'SKU is required', code: 'MISSING_SKU' },
      });
      return;
    }

    const product = await db.query(
      'SELECT id FROM products WHERE sku = $1',
      [sku]
    );

    if (product.rows.length === 0) {
      throw new NotFoundError('Product');
    }

    const allowedUpdates = ['price', 'stock_quantity', 'status', 'name', 'description'];
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        updateFields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updateFields.length > 0) {
      values.push(product.rows[0].id);
      await db.query(
        `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    sendSuccess(res, {
      updated: true,
      productId: product.rows[0].id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Protected webhook config endpoints
// ==========================================

router.use(authenticate);

// List webhook configs
router.get('/configs', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await db.query(
      `SELECT id, name, url, events, is_active, last_triggered_at, failure_count, created_at
       FROM webhook_configs WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    sendSuccess(res, result.rows);
  } catch (error) {
    next(error);
  }
});

// Create webhook config
router.post('/configs', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name, url, events, secret } = req.body;

    const result = await db.query(
      `INSERT INTO webhook_configs (user_id, name, url, events, secret)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, url, events, is_active, created_at`,
      [userId, name, url, JSON.stringify(events), secret]
    );

    sendCreated(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update webhook config
router.patch('/configs/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name, url, events, secret, isActive } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (url !== undefined) {
      updates.push(`url = $${paramIndex++}`);
      values.push(url);
    }
    if (events !== undefined) {
      updates.push(`events = $${paramIndex++}`);
      values.push(JSON.stringify(events));
    }
    if (secret !== undefined) {
      updates.push(`secret = $${paramIndex++}`);
      values.push(secret);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      const current = await db.query(
        'SELECT * FROM webhook_configs WHERE id = $1 AND user_id = $2',
        [req.params.id, userId]
      );
      if (current.rows.length === 0) throw new NotFoundError('Webhook config');
      return sendSuccess(res, current.rows[0]);
    }

    values.push(req.params.id, userId);

    const result = await db.query(
      `UPDATE webhook_configs SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Webhook config');
    }

    sendSuccess(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete webhook config
router.delete('/configs/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await db.query(
      'DELETE FROM webhook_configs WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Webhook config');
    }

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

// Get webhook logs
router.get('/configs/:id/logs', async (req, res, next) => {
  try {
    const userId = req.user!.userId;

    // Verify ownership
    const config = await db.query(
      'SELECT id FROM webhook_configs WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );

    if (config.rows.length === 0) {
      throw new NotFoundError('Webhook config');
    }

    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 50;
    const offset = (page - 1) * perPage;

    const result = await db.query(
      `SELECT * FROM webhook_logs
       WHERE webhook_config_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, perPage, offset]
    );

    sendSuccess(res, result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
