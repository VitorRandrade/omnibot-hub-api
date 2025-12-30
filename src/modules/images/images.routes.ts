import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { imagesController } from './images.controller.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import { env } from '../../config/env.js';

const router = Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(env.UPLOADS_DIR, 'images'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
  },
});

// Public route (no auth) for n8n and external access
router.get('/:id', (req, res, next) => imagesController.servePublic(req, res, next));

// Protected routes
router.use(authenticate);

router.get('/', (req, res, next) => imagesController.list(req, res, next));
router.get('/stats', (req, res, next) => imagesController.getStats(req, res, next));
router.get('/categories', (req, res, next) => imagesController.getCategories(req, res, next));
router.get('/:id/info', (req, res, next) => imagesController.getById(req, res, next));
router.post('/upload', upload.single('file'), (req, res, next) => imagesController.upload(req, res, next));
router.patch('/:id', (req, res, next) => imagesController.update(req, res, next));
router.delete('/:id', (req, res, next) => imagesController.delete(req, res, next));

export default router;
