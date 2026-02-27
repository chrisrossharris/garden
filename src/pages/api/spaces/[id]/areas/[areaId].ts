import type { APIRoute } from 'astro';
import { one } from '@/lib/db/client';
import { ensureUserByClerkId } from '@/lib/services/users';
import { refreshSpaceSqft, updateAreaSqft } from '@/lib/services/spaces';

async function requireOwnedSpace(spaceId: string, clerkUserId: string) {
  const appUser = await ensureUserByClerkId(clerkUserId);
  const owned = await one<{ id: string }>(
    `SELECT id FROM garden_spaces WHERE id = $1 AND user_id = $2`,
    [spaceId, appUser.id]
  );
  return { appUser, owned: !!owned };
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const spaceId = params.id;
  const areaId = params.areaId;
  if (!spaceId || !areaId) return new Response('Missing route params', { status: 400 });

  const { owned } = await requireOwnedSpace(spaceId, auth.userId);
  if (!owned) return new Response('Not found', { status: 404 });

  const body = (await request.json()) as { sqft?: number };
  const sqft = Number(body.sqft ?? 0);
  if (!Number.isFinite(sqft) || sqft < 0.25 || sqft > 20000) {
    return new Response('Invalid sqft', { status: 400 });
  }

  const areaOwned = await one<{ id: string }>(
    `SELECT ga.id
     FROM garden_areas ga
     JOIN garden_spaces gs ON gs.id = ga.garden_space_id
     JOIN users u ON u.id = gs.user_id
     WHERE ga.id = $1 AND gs.id = $2 AND u.clerk_user_id = $3`,
    [areaId, spaceId, auth.userId]
  );
  if (!areaOwned) return new Response('Area not found', { status: 404 });

  await updateAreaSqft({ spaceId, areaId, sqft: Math.round(sqft * 100) / 100 });
  await refreshSpaceSqft(spaceId);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

