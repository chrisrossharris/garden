import { one, query } from '@/lib/db/client';
import type { SunExposure } from '@/lib/types/models';

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
  }>(
    `SELECT s.id, s.name, s.zip, COALESCE(SUM(a.sqft), 0)::text AS total_sqft, s.created_at::text
     FROM garden_spaces s
     LEFT JOIN garden_areas a ON a.garden_space_id = s.id
     WHERE s.user_id = $1
     GROUP BY s.id
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
  }>(
    `SELECT id, name, zip, timezone, goals_json
     FROM garden_spaces
     WHERE id = $1 AND user_id = $2`,
    [spaceId, userId]
  );
}

export async function listAreas(spaceId: string) {
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
     ORDER BY created_at ASC`,
    [spaceId]
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
