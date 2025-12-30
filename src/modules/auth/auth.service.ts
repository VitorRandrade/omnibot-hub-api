import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { hashPassword, comparePassword } from '../../shared/utils/hash.utils.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  getTokenExpiration,
} from '../../shared/utils/jwt.utils.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../shared/middleware/error.middleware.js';
import {
  RegisterDTO,
  LoginDTO,
  UpdateProfileDTO,
  ChangePasswordDTO,
} from './auth.dto.js';

interface User {
  id: string;
  tenant_id: string;
  email: string;
  nome: string;
  role: string;
  avatar_url: string | null;
  ativo: boolean;
}

interface UserResponse {
  id: string;
  email: string;
  name: string; // Mantemos 'name' na resposta para compatibilidade frontend
  role: string;
  avatar_url: string | null;
}

interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  async register(data: RegisterDTO): Promise<AuthResponse> {
    // Check if user exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [data.email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Para novos registros, usamos o tenant_id do primeiro admin (sistema multi-tenant)
    // Em produção, isso deveria ser gerenciado de forma diferente
    const tenantResult = await db.query('SELECT tenant_id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    const tenantId = tenantResult.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000000';

    // Create user (usando colunas do banco existente: nome, ativo)
    const result = await db.query<User>(
      `INSERT INTO users (tenant_id, email, password_hash, nome, role, ativo)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, tenant_id, email, nome, role, avatar_url`,
      [tenantId, data.email.toLowerCase(), passwordHash, data.name, 'user']
    );

    const user = result.rows[0];

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.nome, // Mapeamos nome -> name para frontend
        role: user.role,
        avatar_url: user.avatar_url,
      },
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
    };
  }

  async login(data: LoginDTO): Promise<AuthResponse> {
    // Find user (usando colunas do banco existente: nome, ativo)
    const result = await db.query<User & { password_hash: string }>(
      `SELECT id, tenant_id, email, password_hash, nome, role, avatar_url, ativo
       FROM users WHERE email = $1`,
      [data.email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = result.rows[0];

    if (!user.ativo) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Verify password
    const isValid = await comparePassword(data.password, user.password_hash);

    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update ultimo_login
    await db.query('UPDATE users SET ultimo_login = NOW() WHERE id = $1', [user.id]);

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.nome, // Mapeamos nome -> name para frontend
        role: user.role,
        avatar_url: user.avatar_url,
      },
      accessToken,
      refreshToken,
      expiresIn: 3600,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    // Verify token
    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if token exists in database
    const session = await db.query(
      `SELECT id FROM user_sessions
       WHERE refresh_token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );

    if (session.rows.length === 0) {
      throw new UnauthorizedError('Refresh token expired or revoked');
    }

    // Get user (usando colunas existentes: ativo)
    const user = await db.query<User>(
      'SELECT id, email, role, ativo FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (user.rows.length === 0 || !user.rows[0].ativo) {
      throw new UnauthorizedError('User not found or deactivated');
    }

    // Generate new access token
    const tokenPayload = {
      userId: user.rows[0].id,
      email: user.rows[0].email,
      role: user.rows[0].role,
    };

    const accessToken = generateAccessToken(tokenPayload);

    return {
      accessToken,
      expiresIn: 3600,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await db.query(
      'DELETE FROM user_sessions WHERE refresh_token = $1',
      [refreshToken]
    );
  }

  async getProfile(userId: string): Promise<UserResponse> {
    const result = await db.query<User>(
      `SELECT id, email, nome, role, avatar_url
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.nome, // Mapeamos nome -> name
      role: user.role,
      avatar_url: user.avatar_url,
    };
  }

  async updateProfile(userId: string, data: UpdateProfileDTO): Promise<UserResponse> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`nome = $${paramIndex++}`); // Usando nome em vez de name
      values.push(data.name);
    }

    if (data.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(data.avatarUrl);
    }

    if (updates.length === 0) {
      return this.getProfile(userId);
    }

    values.push(userId);

    const result = await db.query<User>(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, nome, role, avatar_url`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.nome, // Mapeamos nome -> name
      role: user.role,
      avatar_url: user.avatar_url,
    };
  }

  async changePassword(userId: string, data: ChangePasswordDTO): Promise<void> {
    // Get current password
    const user = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (user.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isValid = await comparePassword(data.currentPassword, user.rows[0].password_hash);

    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(data.newPassword);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Revoke all sessions
    await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }

  private async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const expiresAt = getTokenExpiration(env.JWT_REFRESH_EXPIRES);

    await db.query(
      `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, refreshToken, expiresAt]
    );
  }
}

export const authService = new AuthService();
