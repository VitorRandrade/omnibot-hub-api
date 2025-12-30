import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';

const router = Router();

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(env.UPLOADS_DIR, 'documents'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, and TXT are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
  },
});

router.use(authenticate);

// List documents
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;
    const offset = (page - 1) * perPage;

    const countResult = await db.query(
      'SELECT COUNT(*) FROM documents WHERE user_id = $1',
      [userId]
    );

    const result = await db.query(
      `SELECT * FROM documents WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, perPage, offset]
    );

    sendSuccess(res, result.rows, 200, {
      total: parseInt(countResult.rows[0].count),
      page,
      perPage,
    });
  } catch (error) {
    next(error);
  }
});

// Get stats
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'processed') as processed,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'error') as error
       FROM documents WHERE user_id = $1`,
      [userId]
    );

    sendSuccess(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get by ID
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await db.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Document');
    }

    sendSuccess(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Upload document
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: { message: 'No file uploaded', code: 'NO_FILE' },
      });
      return;
    }

    const fileType = path.extname(file.originalname).replace('.', '').toUpperCase();

    const result = await db.query(
      `INSERT INTO documents (user_id, name, file_type, file_size, file_path, mime_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [userId, file.originalname, fileType, file.size, file.filename, file.mimetype]
    );

    sendCreated(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete document
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await db.query(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Document');
    }

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

// Download document
router.get('/:id/download', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await db.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Document');
    }

    const doc = result.rows[0];
    const filePath = path.resolve(env.UPLOADS_DIR, 'documents', doc.file_path);

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.name}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

export default router;
