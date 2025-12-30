import { Router } from 'express';
import { usersController } from './users.controller.js';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware.js';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

router.get('/', (req, res, next) => usersController.list(req, res, next));
router.get('/:id', (req, res, next) => usersController.getById(req, res, next));
router.post('/', (req, res, next) => usersController.create(req, res, next));
router.patch('/:id', (req, res, next) => usersController.update(req, res, next));
router.delete('/:id', (req, res, next) => usersController.delete(req, res, next));

export default router;
