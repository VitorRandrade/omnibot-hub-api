import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/refresh', (req, res, next) => authController.refresh(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));

// Protected routes
router.get('/me', authenticate, (req, res, next) => authController.getProfile(req, res, next));
router.patch('/me', authenticate, (req, res, next) => authController.updateProfile(req, res, next));
router.patch('/me/password', authenticate, (req, res, next) => authController.changePassword(req, res, next));

export default router;
