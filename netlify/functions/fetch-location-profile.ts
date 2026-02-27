import type { Handler } from '@netlify/functions';
import { getLocationProfile } from '../../src/lib/services/location';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const { zip } = JSON.parse(event.body ?? '{}') as { zip?: string };
  if (!zip) return { statusCode: 400, body: 'zip required' };

  const profile = await getLocationProfile(zip);
  return {
    statusCode: 200,
    body: JSON.stringify(profile)
  };
};
