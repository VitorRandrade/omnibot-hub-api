import { db } from '../../config/database.js';
import { hashPassword } from '../../shared/utils/hash.utils.js';
import { NotFoundError, ConflictError } from '../../shared/middleware/error.middleware.js';
import { CreateUserDTO, UpdateUserDTO } from './users.dto.js';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date;
}

interface ListParams {
  page: number;
  perPage: number;
  search?: string;
}

export class UsersService {
  async list(params: ListParams): Promise<{ users: User[]; total: number }> {
    const { page, perPage, search } = params;
    const offset = (page - 1) * perPage;

    let whereClause = '';
    const values: any[] = [];

    if (search) {
      whereClause = 'WHERE name ILIKE $1 OR email ILIKE $1';
      values.push(`%${search}%`);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      values
    );

    const result = await db.query<User>(
      `SELECT id, email, name, role, avatar_url, is_active, created_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, perPage, offset]
    );

    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  async getById(id: string): Promise<User> {
    const result = await db.query<User>(
      `SELECT id, email, name, role, avatar_url, is_active, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return result.rows[0];
  }

  async create(data: CreateUserDTO): Promise<User> {
    // Check if email exists
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [data.email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await hashPassword(data.password);

    const result = await db.query<User>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, avatar_url, is_active, created_at`,
      [data.email.toLowerCase(), passwordHash, data.name, data.role]
    );

    return result.rows[0];
  }

  async update(id: string, data: UpdateUserDTO): Promise<User> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (data.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(data.avatarUrl);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    values.push(id);

    const result = await db.query<User>(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, name, role, avatar_url, is_active, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }
  }
}

export const usersService = new UsersService();
