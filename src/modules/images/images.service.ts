import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { UpdateImageDTO } from './images.dto.js';
import path from 'path';
import fs from 'fs/promises';

interface Image {
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

export class ImagesService {
  async list(params: ListParams): Promise<{ images: Image[]; total: number }> {
    const { userId, page, perPage, category, search } = params;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(category);
    }

    if (search) {
      conditions.push(`name ILIKE $${paramIndex++}`);
      values.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM images WHERE ${whereClause}`,
      values
    );

    const result = await db.query<Image>(
      `SELECT * FROM images
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, perPage, offset]
    );

    return {
      images: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  async getById(id: string, userId?: string): Promise<Image> {
    let query = 'SELECT * FROM images WHERE id = $1';
    const values: any[] = [id];

    if (userId) {
      query += ' AND user_id = $2';
      values.push(userId);
    }

    const result = await db.query<Image>(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundError('Image');
    }

    return result.rows[0];
  }

  async create(
    userId: string,
    file: Express.Multer.File,
    data: { name?: string; category?: string }
  ): Promise<Image> {
    const fileName = data.name || file.originalname;
    const publicUrl = `${env.API_URL}/v1/public/images`;

    const result = await db.query<Image>(
      `INSERT INTO images (user_id, name, category, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, fileName, data.category, file.filename, file.size, file.mimetype]
    );

    const image = result.rows[0];

    // Update public URL with image ID
    await db.query(
      'UPDATE images SET public_url = $1 WHERE id = $2',
      [`${publicUrl}/${image.id}`, image.id]
    );

    return this.getById(image.id, userId);
  }

  async update(id: string, userId: string, data: UpdateImageDTO): Promise<Image> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(data.category);
    }

    if (updates.length === 0) {
      return this.getById(id, userId);
    }

    values.push(id, userId);

    const result = await db.query<Image>(
      `UPDATE images SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Image');
    }

    return result.rows[0];
  }

  async delete(id: string, userId: string): Promise<void> {
    const image = await this.getById(id, userId);

    // Delete file from disk
    const filePath = path.join(env.UPLOADS_DIR, 'images', image.file_path);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist, continue
    }

    const result = await db.query(
      'DELETE FROM images WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Image');
    }
  }

  async incrementUsage(id: string): Promise<void> {
    await db.query(
      'UPDATE images SET usage_count = usage_count + 1 WHERE id = $1',
      [id]
    );
  }

  async getCategories(userId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT DISTINCT category FROM images
       WHERE user_id = $1 AND category IS NOT NULL
       ORDER BY category`,
      [userId]
    );

    return result.rows.map(row => row.category);
  }

  async getStats(userId: string): Promise<any> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(file_size) as total_size,
        SUM(usage_count) as total_usage
       FROM images WHERE user_id = $1`,
      [userId]
    );

    const categoryStats = await db.query(
      `SELECT category, COUNT(*) as count
       FROM images
       WHERE user_id = $1
       GROUP BY category`,
      [userId]
    );

    return {
      ...result.rows[0],
      byCategory: categoryStats.rows,
    };
  }
}

export const imagesService = new ImagesService();
