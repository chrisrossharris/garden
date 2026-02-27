import type { APIRoute } from 'astro';
import { pool, one, query } from '@/lib/db/client';
import { ensureUserByClerkId } from '@/lib/services/users';

type LayoutPlacement = {
  plantId: string;
  zone: 'border' | 'center' | 'trellis';
  quantity: number;
};

type AreaLayout = {
  areaId: string;
  xPct: number;
  yPct: number;
};

async function getSpaceAccess(spaceId: string, clerkUserId: string) {
  const appUser = await ensureUserByClerkId(clerkUserId);
  const access = await one<{ id: string; role: 'OWNER' | 'EDITOR' | 'VIEWER' }>(
    `SELECT gs.id, CASE WHEN gs.user_id = $2 THEN 'OWNER' ELSE sm.role::text END AS role
     FROM garden_spaces gs
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $2
     WHERE gs.id = $1
       AND (gs.user_id = $2 OR sm.user_id = $2)`,
    [spaceId, appUser.id]
  );
  return { appUser, role: access?.role ?? null };
}

export const GET: APIRoute = async ({ params, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const spaceId = params.id;
  if (!spaceId) return new Response('Space id required', { status: 400 });

  const { role } = await getSpaceAccess(spaceId, auth.userId);
  if (!role) return new Response('Not found', { status: 404 });

  let rows: {
    area_id: string;
    plant_id: string;
    zone: 'border' | 'center' | 'trellis';
    quantity: number;
  }[] = [];
  let areaLayouts: { area_id: string; x_pct: number; y_pct: number }[] = [];
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

  try {
    areaLayouts = await query<{ area_id: string; x_pct: number; y_pct: number }>(
      `SELECT garden_area_id AS area_id, x_pct::float8 AS x_pct, y_pct::float8 AS y_pct
       FROM garden_area_layouts
       WHERE garden_space_id = $1`,
      [spaceId]
    );
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') throw error;
  }

  return new Response(JSON.stringify({ items: rows, areaLayouts }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const spaceId = params.id;
  if (!spaceId) return new Response('Space id required', { status: 400 });

  const { role, appUser } = await getSpaceAccess(spaceId, auth.userId);
  if (!role) return new Response('Not found', { status: 404 });
  if (!['OWNER', 'EDITOR'].includes(role)) return new Response('Forbidden', { status: 403 });

  const body = (await request.json()) as {
    areaId?: string;
    placements?: LayoutPlacement[];
    areaLayouts?: AreaLayout[];
  };

  const isPlacementUpdate = Boolean(body.areaId && Array.isArray(body.placements));
  const isAreaLayoutUpdate = Array.isArray(body.areaLayouts);

  if (!isPlacementUpdate && !isAreaLayoutUpdate) {
    return new Response('Invalid payload', { status: 400 });
  }

  if (isPlacementUpdate) {
    const areaRow = await one<{ id: string }>(
      `SELECT ga.id
       FROM garden_areas ga
       JOIN garden_spaces gs ON gs.id = ga.garden_space_id
       LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $3
       WHERE ga.id = $1
         AND gs.id = $2
         AND (gs.user_id = $3 OR (sm.user_id = $3 AND sm.role::text IN ('OWNER','EDITOR')))`,
      [body.areaId, spaceId, appUser.id]
    );
    if (!areaRow) return new Response('Area not found', { status: 404 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isPlacementUpdate) {
      const normalized = (body.placements ?? [])
        .filter((p) => p.plantId && ['border', 'center', 'trellis'].includes(p.zone))
        .map((p) => ({
          plantId: p.plantId,
          zone: p.zone,
          quantity: Math.max(1, Math.floor(Number(p.quantity) || 1))
        }));

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
    }

    if (isAreaLayoutUpdate) {
      const rows = await client.query<{ id: string }>(
        `SELECT ga.id
         FROM garden_areas ga
         JOIN garden_spaces gs ON gs.id = ga.garden_space_id
         LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $2
         WHERE gs.id = $1
           AND (gs.user_id = $2 OR (sm.user_id = $2 AND sm.role::text IN ('OWNER','EDITOR')))`,
        [spaceId, appUser.id]
      );
      const allowed = new Set(rows.rows.map((r) => r.id));
      await client.query('DELETE FROM garden_area_layouts WHERE garden_space_id = $1', [spaceId]);

      for (const layout of body.areaLayouts ?? []) {
        if (!layout.areaId || !allowed.has(layout.areaId)) continue;
        const x = Math.max(0, Math.min(95, Number(layout.xPct) || 0));
        const y = Math.max(0, Math.min(95, Number(layout.yPct) || 0));
        await client.query(
          `INSERT INTO garden_area_layouts (garden_space_id, garden_area_id, x_pct, y_pct)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (garden_area_id)
           DO UPDATE SET x_pct = EXCLUDED.x_pct, y_pct = EXCLUDED.y_pct`,
          [spaceId, layout.areaId, x, y]
        );
      }
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
