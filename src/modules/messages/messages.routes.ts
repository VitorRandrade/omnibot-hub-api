import { Router } from 'express';
import { messagesController } from './messages.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router({ mergeParams: true }); // mergeParams para acessar :conversationId

router.use(authenticate);

// GET /v1/conversations/:conversationId/messages - Listar mensagens da conversa
router.get('/', (req, res, next) => messagesController.listByConversation(req, res, next));

// POST /v1/conversations/:conversationId/messages - Enviar mensagem
router.post('/', (req, res, next) => messagesController.create(req, res, next));

// POST /v1/conversations/:conversationId/messages/read - Marcar como lidas
router.post('/read', (req, res, next) => messagesController.markAsRead(req, res, next));

// GET /v1/conversations/:conversationId/messages/unread-count - Contar não lidas
router.get('/unread-count', (req, res, next) => messagesController.getUnreadCount(req, res, next));

export default router;
