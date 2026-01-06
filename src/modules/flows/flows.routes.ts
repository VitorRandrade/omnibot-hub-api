import { Router } from 'express';
import { flowsController } from './flows.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// GET /v1/flows - List flows
router.get('/', (req, res, next) => flowsController.list(req, res, next));

// GET /v1/flows/stats - Get flow stats
router.get('/stats', (req, res, next) => flowsController.getStats(req, res, next));

// GET /v1/flows/templates - Get templates
router.get('/templates', (req, res, next) => flowsController.getTemplates(req, res, next));

// POST /v1/flows/from-template - Create from template
router.post('/from-template', (req, res, next) => flowsController.createFromTemplate(req, res, next));

// GET /v1/flows/:id - Get flow by ID
router.get('/:id', (req, res, next) => flowsController.getById(req, res, next));

// POST /v1/flows - Create flow
router.post('/', (req, res, next) => flowsController.create(req, res, next));

// PATCH /v1/flows/:id - Update flow
router.patch('/:id', (req, res, next) => flowsController.update(req, res, next));

// DELETE /v1/flows/:id - Delete flow
router.delete('/:id', (req, res, next) => flowsController.delete(req, res, next));

// POST /v1/flows/:id/activate - Activate flow
router.post('/:id/activate', (req, res, next) => flowsController.activate(req, res, next));

// POST /v1/flows/:id/deactivate - Deactivate flow
router.post('/:id/deactivate', (req, res, next) => flowsController.deactivate(req, res, next));

// POST /v1/flows/:id/execute - Execute flow manually
router.post('/:id/execute', (req, res, next) => flowsController.execute(req, res, next));

// POST /v1/flows/:id/duplicate - Duplicate flow
router.post('/:id/duplicate', (req, res, next) => flowsController.duplicate(req, res, next));

// GET /v1/flows/:id/executions - Get flow executions
router.get('/:id/executions', (req, res, next) => flowsController.getExecutions(req, res, next));

export default router;
