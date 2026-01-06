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

// Helper to get tenant_id from user
async function getTenantId(userId: string): Promise<string | null> {
  const result = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0].tenant_id : null;
}

// Map DB document to API response
function mapDocumentToResponse(doc: any) {
  return {
    id: doc.id,
    user_id: doc.tenant_id,
    name: doc.nome || doc.name,
    file_type: doc.tipo || doc.file_type,
    file_size: doc.tamanho || doc.file_size || 0,
    file_path: doc.caminho || doc.file_path,
    mime_type: doc.mime_type,
    status: doc.status || 'processed',
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

// List documents
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;
    const offset = (page - 1) * perPage;

    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      sendSuccess(res, [], 200, { total: 0, page, perPage });
      return;
    }

    try {
      const countResult = await db.query(
        'SELECT COUNT(*) FROM documentos WHERE tenant_id = $1',
        [tenantId]
      );

      const result = await db.query(
        `SELECT * FROM documentos WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, perPage, offset]
      );

      sendSuccess(res, result.rows.map(mapDocumentToResponse), 200, {
        total: parseInt(countResult.rows[0].count),
        page,
        perPage,
      });
    } catch (dbError: any) {
      // If table doesn't exist, return empty array
      if (dbError.code === '42P01') {
        sendSuccess(res, [], 200, { total: 0, page, perPage });
        return;
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
});

// Get stats
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      sendSuccess(res, { total: 0, processed: 0, processing: 0, error: 0 });
      return;
    }

    try {
      const result = await db.query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'processed' OR status = 'processado')::int as processed,
          COUNT(*) FILTER (WHERE status = 'processing' OR status = 'processando')::int as processing,
          COUNT(*) FILTER (WHERE status = 'error' OR status = 'erro')::int as error
         FROM documentos WHERE tenant_id = $1`,
        [tenantId]
      );

      const row = result.rows[0];
      sendSuccess(res, {
        total: row.total || 0,
        processed: row.processed || 0,
        processing: row.processing || 0,
        error: row.error || 0,
      });
    } catch (dbError: any) {
      // If table doesn't exist, return zeros
      if (dbError.code === '42P01') {
        sendSuccess(res, { total: 0, processed: 0, processing: 0, error: 0 });
        return;
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
});

// Get by ID
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      throw new NotFoundError('Document');
    }

    const result = await db.query(
      'SELECT * FROM documentos WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Document');
    }

    sendSuccess(res, mapDocumentToResponse(result.rows[0]));
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

    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    const fileType = path.extname(file.originalname).replace('.', '').toUpperCase();

    try {
      const result = await db.query(
        `INSERT INTO documentos (tenant_id, nome, tipo, tamanho, caminho, mime_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [tenantId, file.originalname, fileType, file.size, file.filename, file.mimetype]
      );

      sendCreated(res, mapDocumentToResponse(result.rows[0]));
    } catch (dbError: any) {
      // If table doesn't exist, try with English column names
      if (dbError.code === '42P01' || dbError.code === '42703') {
        const result = await db.query(
          `INSERT INTO documents (user_id, name, file_type, file_size, file_path, mime_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           RETURNING *`,
          [userId, file.originalname, fileType, file.size, file.filename, file.mimetype]
        );
        sendCreated(res, result.rows[0]);
        return;
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
});

// Delete document
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      throw new NotFoundError('Document');
    }

    const result = await db.query(
      'DELETE FROM documentos WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, tenantId]
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
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      throw new NotFoundError('Document');
    }

    const result = await db.query(
      'SELECT * FROM documentos WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Document');
    }

    const doc = result.rows[0];
    const filePath = path.resolve(env.UPLOADS_DIR, 'documents', doc.caminho || doc.file_path);

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.nome || doc.name}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

export default router;
