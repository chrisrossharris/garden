import { one, query } from '@/lib/db/client';

export async function ensureUserByClerkId(clerkUserId: string) {
  const existing = await one<{ id: string }>('SELECT id FROM users WHERE clerk_user_id = $1', [clerkUserId]);
  if (existing) {
    return existing;
  }

  const inserted = await one<{ id: string }>(
    'INSERT INTO users (clerk_user_id) VALUES ($1) RETURNING id',
    [clerkUserId]
  );

  if (!inserted) throw new Error('Failed to create user');
  return inserted;
}

export async function getUserByClerkId(clerkUserId: string) {
  return one<{ id: string; clerk_user_id: string }>('SELECT id, clerk_user_id FROM users WHERE clerk_user_id = $1', [clerkUserId]);
}

export async function getSubscription(userId: string) {
  const rows = await query<{
    plan: 'BASIC' | 'PLUS' | 'ULTRA';
    status: string;
    current_period_end: string | null;
  }>(
    `SELECT plan, status, current_period_end
     FROM subscriptions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}
