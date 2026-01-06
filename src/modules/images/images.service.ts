import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { UpdateImageDTO } from './images.dto.js';
import path from 'path';
import fs from 'fs/promises';

// Interface do banco (tabela imagens)
interface ImageDB {
  id: string;
  tenant_id: string;
  nome: string;
  categoria: string | null;
  caminho: string;
  tamanho: number;
  mime_type: string | null;
  largura: number | null;
  altura: number | null;
  url_publica: string | null;
  uso_count: number;
  created_at: Date;
  updated_at: Date;
}

// Interface da resposta API
interface ImageResponse {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  public_url: string | null;
  usage_count: number;
  created_at: Date;
  updated_at: Date;
}

interface ListParams {
  userId: string;
  page: number;
  perPage: number;
  category?: string;
  search?: string;
}

// Helper to get tenant_id from user
async function getTenantId(userId: string): Promise<string | null> {
  const result = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0].tenant_id : null;
}

// Map DB to API response
function mapImageToResponse(img: any): ImageResponse {
  return {
    id: img.id,
    user_id: img.tenant_id,
    name: img.nome || img.name,
    category: img.categoria || img.category,
    file_path: img.caminho || img.file_path,
    file_size: img.tamanho || img.file_size || 0,
    mime_type: img.mime_type,
    width: img.largura || img.width,
    height: img.altura || img.height,
    public_url: img.url_publica || img.public_url,
    usage_count: img.uso_count || img.usage_count || 0,
    created_at: img.created_at,
    updated_at: img.updated_at,
  };
}

export class ImagesService {
  async list(params: ListParams): Promise<{ images: ImageResponse[]; total: number }> {
    const { userId, page, perPage, category, search } = params;
    const offset = (page - 1) * perPage;

    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { images: [], total: 0 };
    }

    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      conditions.push(`categoria = $${paramIndex++}`);
      values.push(category);
    }

    if (search) {
      conditions.push(`nome ILIKE $${paramIndex++}`);
      values.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    try {
      const countResult = await db.query(
        `SELECT COUNT(*) FROM imagens WHERE ${whereClause}`,
        values
      );

      const result = await db.query<ImageDB>(
        `SELECT * FROM imagens
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, perPage, offset]
      );

      return {
        images: result.rows.map(mapImageToResponse),
        total: parseInt(countResult.rows[0].count),
      };
    } catch (dbError: any) {
      // If table doesn't exist, return empty
      if (dbError.code === '42P01') {
        return { images: [], total: 0 };
      }
      throw dbError;
    }
  }

  async getById(id: string, userId?: string): Promise<ImageResponse> {
    let tenantId: string | null = null;
    if (userId) {
      tenantId = await getTenantId(userId);
    }

    let query = 'SELECT * FROM imagens WHERE id = $1';
    const values: any[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      values.push(tenantId);
    }

    const result = await db.query<ImageDB>(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundError('Image');
    }

    return mapImageToResponse(result.rows[0]);
  }

  async create(
    userId: string,
    file: Express.Multer.File,
    data: { name?: string; category?: string }
  ): Promise<ImageResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    const fileName = data.name || file.originalname;
    const publicUrl = `${env.API_URL}/v1/public/images`;

    try {
      const result = await db.query<ImageDB>(
        `INSERT INTO imagens (tenant_id, nome, categoria, caminho, tamanho, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [tenantId, fileName, data.category, file.filename, file.size, file.mimetype]
      );

      const image = result.rows[0];

      // Update public URL with image ID
      await db.query(
        'UPDATE imagens SET url_publica = $1 WHERE id = $2',
        [`${publicUrl}/${image.id}`, image.id]
      );

      return this.getById(image.id, userId);
    } catch (dbError: any) {
      // Fallback to English column names if table structure is different
      if (dbError.code === '42P01' || dbError.code === '42703') {
        const result = await db.query(
          `INSERT INTO images (user_id, name, category, file_path, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [userId, fileName, data.category, file.filename, file.size, file.mimetype]
        );
        return result.rows[0] as ImageResponse;
      }
      throw dbError;
    }
  }

  async update(id: string, userId: string, data: UpdateImageDTO): Promise<ImageResponse> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      throw new NotFoundError('User');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`nome = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.category !== undefined) {
      updates.push(`categoria = $${paramIndex++}`);
      values.push(data.category);
    }

    if (updates.length === 0) {
      return this.getById(id, userId);
    }

    values.push(id, tenantId);

    const result = await db.query<ImageDB>(
      `UPDATE imagens SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Image');
    }

    return mapImageToResponse(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<void> {
    const image = await this.getById(id, userId);
    const tenantId = await getTenantId(userId);

    // Delete file from disk
    const filePath = path.join(env.UPLOADS_DIR, 'images', image.file_path);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist, continue
    }

    const result = await db.query(
      'DELETE FROM imagens WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Image');
    }
  }

  async incrementUsage(id: string): Promise<void> {
    await db.query(
      'UPDATE imagens SET uso_count = uso_count + 1 WHERE id = $1',
      [id]
    );
  }

  async getCategories(userId: string): Promise<string[]> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return [];
    }

    try {
      const result = await db.query(
        `SELECT DISTINCT categoria FROM imagens
         WHERE tenant_id = $1 AND categoria IS NOT NULL
         ORDER BY categoria`,
        [tenantId]
      );

      return result.rows.map(row => row.categoria);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return [];
      }
      throw dbError;
    }
  }

  async getStats(userId: string): Promise<any> {
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return { total: 0, totalSize: 0, totalUsage: 0, byCategory: {} };
    }

    try {
      const result = await db.query(
        `SELECT
          COUNT(*)::int as total,
          COALESCE(SUM(tamanho), 0)::bigint as total_size,
          COALESCE(SUM(uso_count), 0)::int as total_usage
         FROM imagens WHERE tenant_id = $1`,
        [tenantId]
      );

      const categoryStats = await db.query(
        `SELECT categoria, COUNT(*)::int as count
         FROM imagens
         WHERE tenant_id = $1
         GROUP BY categoria`,
        [tenantId]
      );

      const byCategory: Record<string, number> = {};
      categoryStats.rows.forEach(row => {
        if (row.categoria) {
          byCategory[row.categoria] = row.count;
        }
      });

      const row = result.rows[0];
      return {
        total: row.total || 0,
        totalSize: parseInt(row.total_size) || 0,
        totalUsage: row.total_usage || 0,
        byCategory,
      };
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return { total: 0, totalSize: 0, totalUsage: 0, byCategory: {} };
      }
      throw dbError;
    }
  }
}

export const imagesService = new ImagesService();
