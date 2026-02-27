import type { APIRoute } from 'astro';
import { pool, one, query } from '@/lib/db/client';
import { ensureUserByClerkId } from '@/lib/services/users';

type LayoutPlacement = {
  plantId: string;
  zone: 'border' | 'center' | 'trellis';
  quantity: number;
};

async function requireOwnedSpace(spaceId: string, clerkUserId: string) {
  const appUser = await ensureUserByClerkId(clerkUserId);
  const owned = await one<{ id: string }>(
    `SELECT id FROM garden_spaces WHERE id = $1 AND user_id = $2`,
    [spaceId, appUser.id]
  );
  return { appUser, owned: !!owned };
}

export const GET: APIRoute = async ({ params, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const spaceId = params.id;
  if (!spaceId) return new Response('Space id required', { status: 400 });

  const { owned } = await requireOwnedSpace(spaceId, auth.userId);
  if (!owned) return new Response('Not found', { status: 404 });

  let rows: {
    area_id: string;
    plant_id: string;
    zone: 'border' | 'center' | 'trellis';
    quantity: number;
  }[] = [];
  try {
    rows = await query<{
      area_id: string;
      plant_id: string;
      zone: 'border' | 'center' | 'trellis';
      quantity: number;
    }>(
      `SELECT ga.id AS area_id, gla.plant_id, gla.zone::text AS zone, gla.quantity
       FROM garden_layout_allocations gla
       JOIN garden_areas ga ON ga.id = gla.garden_area_id
       WHERE ga.garden_space_id = $1`,
      [spaceId]
    );
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') throw error;
  }

  return new Response(JSON.stringify({ items: rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const spaceId = params.id;
  if (!spaceId) return new Response('Space id required', { status: 400 });

  const { owned } = await requireOwnedSpace(spaceId, auth.userId);
  if (!owned) return new Response('Not found', { status: 404 });

  const body = (await request.json()) as {
    areaId?: string;
    placements?: LayoutPlacement[];
  };

  if (!body.areaId || !Array.isArray(body.placements)) {
    return new Response('Invalid payload', { status: 400 });
  }

  const areaRow = await one<{ id: string }>(
    `SELECT ga.id
     FROM garden_areas ga
     JOIN garden_spaces gs ON gs.id = ga.garden_space_id
     JOIN users u ON u.id = gs.user_id
     WHERE ga.id = $1 AND gs.id = $2 AND u.clerk_user_id = $3`,
    [body.areaId, spaceId, auth.userId]
  );

  if (!areaRow) return new Response('Area not found', { status: 404 });

  const normalized = body.placements
    .filter((p) => p.plantId && ['border', 'center', 'trellis'].includes(p.zone))
    .map((p) => ({
      plantId: p.plantId,
      zone: p.zone,
      quantity: Math.max(1, Math.floor(Number(p.quantity) || 1))
    }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM garden_layout_allocations WHERE garden_area_id = $1', [body.areaId]);

    for (const item of normalized) {
      await client.query(
        `INSERT INTO garden_layout_allocations (garden_area_id, plant_id, zone, quantity)
         VALUES ($1, $2, $3::bed_zone, $4)
         ON CONFLICT (garden_area_id, plant_id)
         DO UPDATE SET zone = EXCLUDED.zone, quantity = EXCLUDED.quantity`,
        [body.areaId, item.plantId, item.zone, item.quantity]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '42P01') {
      return new Response(JSON.stringify({ ok: false, reason: 'layout_table_missing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Failed to save layout', { status: 500 });
  } finally {
    client.release();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
