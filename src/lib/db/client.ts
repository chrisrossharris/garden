import { Pool } from '@neondatabase/serverless';
import { requireEnv } from '@/lib/env';

const pool = new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 5 });

export async function query<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function one<T = unknown>(text: string, params: unknown[] = []): Promise<T | null> {
  const res = await pool.query(text, params);
  return (res.rows[0] as T) ?? null;
}

export { pool };
