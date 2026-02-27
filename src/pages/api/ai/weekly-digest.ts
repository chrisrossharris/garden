import type { APIRoute } from 'astro';
import { env } from '@/lib/env';
import { getUserByClerkId } from '@/lib/services/users';
import { getWeeklyDigestData } from '@/lib/services/tasks';

export const GET: APIRoute = async ({ locals }) => {
  const auth = locals.auth?.();
  if (!auth?.userId) return new Response('Unauthorized', { status: 401 });

  const appUser = await getUserByClerkId(auth.userId);
  if (!appUser) return new Response('Unauthorized', { status: 401 });

  const digest = await getWeeklyDigestData(appUser.id);

  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ source: 'fallback', text: digest.digestText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const prompt = `Rewrite this weekly garden digest to be concise and practical.

${digest.digestText}

Rules:
- Max 6 bullet points.
- Put most urgent item first.
- Include one line for this week and one line for next week prep.
- Keep tone direct and helpful.
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
      temperature: 0.3
    })
  });

  if (!resp.ok) {
    return new Response(JSON.stringify({ source: 'fallback', text: digest.digestText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const data = (await resp.json()) as { output_text?: string };
  const text = data.output_text?.trim() || digest.digestText;

  return new Response(JSON.stringify({ source: 'ai', text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
