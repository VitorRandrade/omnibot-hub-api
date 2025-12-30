import { Router } from 'express';
import { agentsController } from './agents.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => agentsController.list(req, res, next));
router.get('/stats', (req, res, next) => agentsController.getStats(req, res, next));
router.get('/:id', (req, res, next) => agentsController.getById(req, res, next));
router.post('/', (req, res, next) => agentsController.create(req, res, next));
router.patch('/:id', (req, res, next) => agentsController.update(req, res, next));
router.patch('/:id/status', (req, res, next) => agentsController.updateStatus(req, res, next));
router.delete('/:id', (req, res, next) => agentsController.delete(req, res, next));

export default router;
