import type { APIRoute } from 'astro';
import { one } from '@/lib/db/client';
import { ensureUserByClerkId } from '@/lib/services/users';
import { refreshSpaceSqft, updateAreaSqft } from '@/lib/services/spaces';

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

export const POST: APIRoute = async ({ params, request, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const spaceId = params.id;
  const areaId = params.areaId;
  if (!spaceId || !areaId) return new Response('Missing route params', { status: 400 });

  const { role, appUser } = await getSpaceAccess(spaceId, auth.userId);
  if (!role) return new Response('Not found', { status: 404 });
  if (!['OWNER', 'EDITOR'].includes(role)) return new Response('Forbidden', { status: 403 });

  const body = (await request.json()) as { sqft?: number };
  const sqft = Number(body.sqft ?? 0);
  if (!Number.isFinite(sqft) || sqft < 0.25 || sqft > 20000) {
    return new Response('Invalid sqft', { status: 400 });
  }

  const areaOwned = await one<{ id: string }>(
    `SELECT ga.id
     FROM garden_areas ga
     JOIN garden_spaces gs ON gs.id = ga.garden_space_id
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $3
     WHERE ga.id = $1
       AND gs.id = $2
       AND (gs.user_id = $3 OR (sm.user_id = $3 AND sm.role::text IN ('OWNER','EDITOR')))`,
    [areaId, spaceId, appUser.id]
  );
  if (!areaOwned) return new Response('Area not found', { status: 404 });

  await updateAreaSqft({ spaceId, areaId, sqft: Math.round(sqft * 100) / 100 });
  await refreshSpaceSqft(spaceId);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
