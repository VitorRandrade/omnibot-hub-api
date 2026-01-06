import { Router } from 'express';
import { channelsController } from './channels.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// GET /v1/channels - Listar canais
router.get('/', (req, res, next) => channelsController.list(req, res, next));

// GET /v1/channels/stats - Estatísticas
router.get('/stats', (req, res, next) => channelsController.getStats(req, res, next));

// GET /v1/channels/:id - Obter canal por ID
router.get('/:id', (req, res, next) => channelsController.getById(req, res, next));

// POST /v1/channels - Criar novo canal
router.post('/', (req, res, next) => channelsController.create(req, res, next));

// PATCH /v1/channels/:id - Atualizar canal
router.patch('/:id', (req, res, next) => channelsController.update(req, res, next));

// POST /v1/channels/:id/connect - Conectar canal
router.post('/:id/connect', (req, res, next) => channelsController.connect(req, res, next));

// POST /v1/channels/:id/disconnect - Desconectar canal
router.post('/:id/disconnect', (req, res, next) => channelsController.disconnect(req, res, next));

// POST /v1/channels/:id/webhook - Gerar URL de webhook
router.post('/:id/webhook', (req, res, next) => channelsController.generateWebhook(req, res, next));

// DELETE /v1/channels/:id - Excluir canal
router.delete('/:id', (req, res, next) => channelsController.delete(req, res, next));

export default router;
