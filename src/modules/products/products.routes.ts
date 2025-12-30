import { Router } from 'express';
import { productsController } from './products.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => productsController.list(req, res, next));
router.get('/stats', (req, res, next) => productsController.getStats(req, res, next));
router.get('/categories', (req, res, next) => productsController.getCategories(req, res, next));
router.get('/search', (req, res, next) => productsController.search(req, res, next));
router.get('/:id', (req, res, next) => productsController.getById(req, res, next));
router.post('/', (req, res, next) => productsController.create(req, res, next));
router.patch('/:id', (req, res, next) => productsController.update(req, res, next));
router.delete('/:id', (req, res, next) => productsController.delete(req, res, next));

export default router;
