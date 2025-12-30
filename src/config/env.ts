import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  API_URL: z.string().default('http://localhost:3001'),

  // Database
  DATABASE_URL: z.string(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432').transform(Number),
  DB_NAME: z.string().default('omnibot_dev'),
  DB_USER: z.string().default('omnibot'),
  DB_PASSWORD: z.string().default('omnibot123'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('1h'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:8080'),

  // Uploads
  UPLOADS_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760').transform(Number),

  // Webhooks
  WEBHOOK_SECRET: z.string().optional(),

  // n8n
  N8N_BASE_URL: z.string().optional(),

  // Frontend
  FRONTEND_URL: z.string().default('http://localhost:8080'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
