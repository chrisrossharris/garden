import { one, query } from '@/lib/db/client';
import { getUserByClerkId } from '@/lib/services/users';
import type { SunExposure } from '@/lib/types/models';

export type SpaceRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export async function createSpace(input: {
  userId: string;
  name: string;
  zip: string;
  timezone?: string;
  goals?: Record<string, unknown>;
}) {
  return one<{ id: string }>(
    `INSERT INTO garden_spaces (user_id, name, zip, timezone, goals_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [input.userId, input.name, input.zip, input.timezone ?? 'America/New_York', JSON.stringify(input.goals ?? {})]
  );
}

export async function createArea(input: {
  spaceId: string;
  name: string;
  type: string;
  sqft: number;
  sunExposure: SunExposure;
  notes?: string;
}) {
  return one<{ id: string }>(
    `INSERT INTO garden_areas (garden_space_id, name, type, sqft, sun_exposure, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.spaceId, input.name, input.type, input.sqft, input.sunExposure, input.notes ?? null]
  );
}

export async function updateArea(input: {
  spaceId: string;
  areaId: string;
  name: string;
  type: string;
  sqft: number;
  sunExposure: SunExposure;
  notes?: string;
}) {
  await query(
    `UPDATE garden_areas
     SET name = $3,
         type = $4,
         sqft = $5,
         sun_exposure = $6,
         notes = $7
     WHERE id = $1
       AND garden_space_id = $2`,
    [input.areaId, input.spaceId, input.name, input.type, input.sqft, input.sunExposure, input.notes ?? null]
  );
}

export async function updateAreaSqft(input: { spaceId: string; areaId: string; sqft: number }) {
  await query(
    `UPDATE garden_areas
     SET sqft = $3
     WHERE id = $1
       AND garden_space_id = $2`,
    [input.areaId, input.spaceId, input.sqft]
  );
}

export async function listSpaces(userId: string) {
  return query<{
    id: string;
    name: string;
    zip: string;
    total_sqft: string;
    created_at: string;
    access_role: SpaceRole;
  }>(
    `SELECT
       s.id,
       s.name,
       s.zip,
       COALESCE(SUM(a.sqft), 0)::text AS total_sqft,
       s.created_at::text,
       CASE WHEN s.user_id = $1 THEN 'OWNER' ELSE sm.role::text END AS access_role
     FROM garden_spaces s
     LEFT JOIN garden_areas a ON a.garden_space_id = s.id
     LEFT JOIN space_members sm ON sm.garden_space_id = s.id AND sm.user_id = $1
     WHERE s.user_id = $1 OR sm.user_id = $1
     GROUP BY s.id, sm.role
     ORDER BY s.created_at DESC`,
    [userId]
  );
}

export async function getSpace(spaceId: string, userId: string) {
  return one<{
    id: string;
    name: string;
    zip: string;
    timezone: string;
    goals_json: Record<string, unknown> | null;
    access_role: SpaceRole;
  }>(
    `SELECT
       s.id,
       s.name,
       s.zip,
       s.timezone,
       s.goals_json,
       CASE WHEN s.user_id = $2 THEN 'OWNER' ELSE sm.role::text END AS access_role
     FROM garden_spaces s
     LEFT JOIN space_members sm ON sm.garden_space_id = s.id AND sm.user_id = $2
     WHERE s.id = $1
       AND (s.user_id = $2 OR sm.user_id = $2)`,
    [spaceId, userId]
  );
}

export async function listAreas(spaceId: string, userId?: string) {
  return query<{
    id: string;
    name: string;
    type: string;
    sqft: string;
    sun_exposure: SunExposure;
    notes: string | null;
  }>(
    `SELECT id, name, type, sqft::text, sun_exposure, notes
     FROM garden_areas
     WHERE garden_space_id = $1
       AND (
         $2::uuid IS NULL
         OR EXISTS (
           SELECT 1
           FROM garden_spaces gs
           LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $2
           WHERE gs.id = garden_areas.garden_space_id
             AND (gs.user_id = $2 OR sm.user_id = $2)
         )
       )
     ORDER BY created_at ASC`,
    [spaceId, userId ?? null]
  );
}

export async function refreshSpaceSqft(spaceId: string) {
  await query(
    `UPDATE garden_spaces
     SET total_sqft = COALESCE((SELECT SUM(sqft) FROM garden_areas WHERE garden_space_id = $1), 0)
     WHERE id = $1`,
    [spaceId]
  );
}

export async function listSpaceMembers(spaceId: string, requesterUserId: string) {
  const allowed = await one<{ id: string }>(
    `SELECT gs.id
     FROM garden_spaces gs
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $2
     WHERE gs.id = $1
       AND (gs.user_id = $2 OR sm.user_id = $2)`,
    [spaceId, requesterUserId]
  );
  if (!allowed) return [];

  return query<{
    user_id: string;
    clerk_user_id: string;
    email: string | null;
    role: SpaceRole;
  }>(
    `SELECT u.id AS user_id, u.clerk_user_id, u.email, x.role::text AS role
     FROM users u
     JOIN (
       SELECT gs.user_id AS user_id, 'OWNER'::space_role AS role
       FROM garden_spaces gs
       WHERE gs.id = $1
       UNION ALL
       SELECT sm.user_id, sm.role
       FROM space_members sm
       WHERE sm.garden_space_id = $1
     ) x ON x.user_id = u.id
     ORDER BY CASE x.role WHEN 'OWNER' THEN 0 WHEN 'EDITOR' THEN 1 ELSE 2 END, u.created_at`,
    [spaceId]
  );
}

export async function addSpaceMemberByClerkId(input: {
  spaceId: string;
  ownerUserId: string;
  targetClerkUserId: string;
  role: Exclude<SpaceRole, 'OWNER'>;
}) {
  const owner = await one<{ id: string; owner_id: string }>(
    `SELECT id, user_id AS owner_id
     FROM garden_spaces
     WHERE id = $1 AND user_id = $2`,
    [input.spaceId, input.ownerUserId]
  );
  if (!owner) throw new Error('Only the owner can share this space');

  const target = await getUserByClerkId(input.targetClerkUserId);
  if (!target) throw new Error('Target user not found. They must sign up first.');
  if (target.id === owner.owner_id) throw new Error('Owner already has access');

  await query(
    `INSERT INTO space_members (garden_space_id, user_id, role, invited_by_user_id)
     VALUES ($1, $2, $3::space_role, $4)
     ON CONFLICT (garden_space_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, invited_by_user_id = EXCLUDED.invited_by_user_id`,
    [input.spaceId, target.id, input.role, input.ownerUserId]
  );
}

export async function removeSpaceMember(input: {
  spaceId: string;
  ownerUserId: string;
  memberUserId: string;
}) {
  const owner = await one<{ id: string }>(
    `SELECT id
     FROM garden_spaces
     WHERE id = $1 AND user_id = $2`,
    [input.spaceId, input.ownerUserId]
  );
  if (!owner) throw new Error('Only the owner can remove members');

  await query(`DELETE FROM space_members WHERE garden_space_id = $1 AND user_id = $2`, [input.spaceId, input.memberUserId]);
}
