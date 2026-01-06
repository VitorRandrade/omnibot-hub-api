import { Router } from 'express';
import { conversationsController } from './conversations.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import messagesRoutes from '../messages/messages.routes.js';

const router = Router();

router.use(authenticate);

// GET /v1/conversations - Listar conversas
router.get('/', (req, res, next) => conversationsController.list(req, res, next));

// GET /v1/conversations/stats - Estatísticas
router.get('/stats', (req, res, next) => conversationsController.getStats(req, res, next));

// GET /v1/conversations/:id - Obter conversa por ID
router.get('/:id', (req, res, next) => conversationsController.getById(req, res, next));

// POST /v1/conversations - Criar nova conversa
router.post('/', (req, res, next) => conversationsController.create(req, res, next));

// PATCH /v1/conversations/:id/status - Atualizar status
router.patch('/:id/status', (req, res, next) => conversationsController.updateStatus(req, res, next));

// PATCH /v1/conversations/:id/assign - Atribuir agente
router.patch('/:id/assign', (req, res, next) => conversationsController.assignAgent(req, res, next));

// POST /v1/conversations/:id/close - Fechar conversa
router.post('/:id/close', (req, res, next) => conversationsController.close(req, res, next));

// Nested routes for messages: /v1/conversations/:conversationId/messages
router.use('/:conversationId/messages', messagesRoutes);

export default router;
