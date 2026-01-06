import { Pool, PoolClient, QueryResult } from 'pg';
import { env } from './env.js';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Track connection errors for monitoring
let connectionErrorCount = 0;
const MAX_ERROR_COUNT = 10;

// FIXED: Don't crash server on idle client errors
// Instead, log and track errors, only exit if too many failures
pool.on('error', (err) => {
  connectionErrorCount++;
  console.error(`[Database] Unexpected error on idle client (${connectionErrorCount}/${MAX_ERROR_COUNT}):`, err.message);

  // Only exit if we've had too many consecutive errors
  // This prevents a single transient error from killing the server
  if (connectionErrorCount >= MAX_ERROR_COUNT) {
    console.error('[Database] Too many connection errors, server will restart');
    process.exit(-1);
  }
});

pool.on('connect', () => {
  // Reset error count on successful connection
  connectionErrorCount = 0;
  console.log('[Database] Connected');
});

pool.on('remove', () => {
  console.log('[Database] Client removed from pool');
});

export const db = {
  query: async <T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
    try {
      return await pool.query<T>(text, params);
    } catch (error: any) {
      // Log query errors for debugging (without sensitive data)
      console.error('[Database] Query error:', error.message);
      throw error;
    }
  },

  getClient: (): Promise<PoolClient> => {
    return pool.connect();
  },

  transaction: async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  close: (): Promise<void> => {
    return pool.end();
  },

  // Health check for monitoring
  isHealthy: async (): Promise<boolean> => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },
};

export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await db.query('SELECT NOW()');
    console.log('[Database] Connection successful:', result.rows[0].now);
    return true;
  } catch (error: any) {
    console.error('[Database] Connection failed:', error.message);
    return false;
  }
};
