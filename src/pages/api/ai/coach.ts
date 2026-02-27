import type { APIRoute } from 'astro';
import { env } from '@/lib/env';
import { one, query } from '@/lib/db/client';

function fallbackAdvice(question: string, context: {
  spaceName: string;
  zip: string;
  zone: string;
  lastFrostStart: string;
  lastFrostEnd: string;
}) {
  const q = question.toLowerCase();
  if (q.includes('tomato') || q.includes('pepper')) {
    return `For ${context.spaceName} (ZIP ${context.zip}, zone ${context.zone}), warm crops like tomatoes/peppers are usually indoor starts 6-10 weeks before last frost (${context.lastFrostStart} to ${context.lastFrostEnd}). Prioritize hardening off before transplant.`;
  }
  if (q.includes('cucumber') || q.includes('sow')) {
    return `Direct sow warm cucurbits after frost risk passes. For your profile, target about 1-2 weeks after ${context.lastFrostEnd}, and use trellis placement to save bed area.`;
  }
  return `Use your frost window (${context.lastFrostStart} to ${context.lastFrostEnd}) as the anchor: indoor starts before it, direct sow sensitive crops after it, and succession sowing through mid-season.`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const body = (await request.json()) as {
    spaceId?: string;
    question?: string;
  };

  if (!body.spaceId || !body.question) {
    return new Response('spaceId and question are required', { status: 400 });
  }

  const space = await one<{
    id: string;
    name: string;
    zip: string;
    zone: string;
    last_frost_start: string;
    last_frost_end: string;
  }>(
    `SELECT gs.id, gs.name, gs.zip, lp.zone, lp.last_frost_start::text, lp.last_frost_end::text
     FROM garden_spaces gs
     JOIN users u ON u.id = gs.user_id
     JOIN location_profiles lp ON lp.zip = gs.zip
     WHERE gs.id = $1 AND u.clerk_user_id = $2`,
    [body.spaceId, auth.userId]
  );

  if (!space) return new Response('Space not found', { status: 404 });

  const plantings = await query<{ plant: string; qty: number }>(
    `SELECT p.common_name AS plant, gp.quantity AS qty
     FROM garden_areas ga
     JOIN garden_plantings gp ON gp.garden_area_id = ga.id
     JOIN plants p ON p.id = gp.plant_id
     WHERE ga.garden_space_id = $1
     ORDER BY p.common_name`,
    [body.spaceId]
  );

  if (!env.OPENAI_API_KEY) {
    const reply = fallbackAdvice(body.question, {
      spaceName: space.name,
      zip: space.zip,
      zone: space.zone,
      lastFrostStart: space.last_frost_start,
      lastFrostEnd: space.last_frost_end
    });
    return new Response(JSON.stringify({ answer: reply, source: 'fallback' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const prompt = `You are Garden OS Coach. Give concise, practical advice for this user.
Context:
- Space: ${space.name}
- ZIP: ${space.zip}
- Zone: ${space.zone}
- Last frost window: ${space.last_frost_start} to ${space.last_frost_end}
- Current plants: ${plantings.map((p) => `${p.plant} x${p.qty}`).join(', ') || 'none'}

User question: ${body.question}

Rules:
- Give a clear recommendation in 3-6 bullet points.
- Include what to do this week.
- Mention indoor vs direct sow timing if relevant.
- Mention one companion planting idea if relevant.
`;

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: prompt,
      temperature: 0.4
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    return new Response(`AI request failed: ${text}`, { status: 502 });
  }

  const data = (await resp.json()) as {
    output_text?: string;
  };

  const answer = data.output_text ?? 'No response generated.';
  return new Response(JSON.stringify({ answer, source: 'ai' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
