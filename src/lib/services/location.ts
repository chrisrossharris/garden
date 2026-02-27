import dayjs from 'dayjs';
import { one, query } from '@/lib/db/client';
import type { LocationProfile } from '@/lib/types/models';

function heuristicFromZone(zip: string, zone: string): LocationProfile {
  const zoneNum = Number.parseInt(zone.split(/[ab]/i)[0] ?? '7', 10);
  const lastStart = dayjs(`2026-03-01`).add((zoneNum - 6) * -7, 'day');
  const lastEnd = lastStart.add(14, 'day');
  const firstStart = dayjs(`2026-10-15`).add((zoneNum - 6) * 7, 'day');
  const firstEnd = firstStart.add(14, 'day');

  return {
    zip,
    zone,
    last_frost_start: lastStart.format('YYYY-MM-DD'),
    last_frost_end: lastEnd.format('YYYY-MM-DD'),
    first_frost_start: firstStart.format('YYYY-MM-DD'),
    first_frost_end: firstEnd.format('YYYY-MM-DD'),
    season_length_days: firstStart.diff(lastEnd, 'day'),
    source: 'estimated'
  };
}

async function fetchZone(zip: string): Promise<string | null> {
  if (!process.env.ZONE_API_KEY) return null;
  const res = await fetch(`https://example-zone-provider.com/zone?zip=${zip}&key=${process.env.ZONE_API_KEY}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { zone?: string };
  return data.zone ?? null;
}

async function fetchFrost(zip: string): Promise<{ lastStart: string; lastEnd: string; firstStart: string; firstEnd: string } | null> {
  if (!process.env.FROST_API_KEY) return null;
  const res = await fetch(`https://example-frost-provider.com/frost?zip=${zip}&key=${process.env.FROST_API_KEY}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    last_frost_start?: string;
    last_frost_end?: string;
    first_frost_start?: string;
    first_frost_end?: string;
  };

  if (!data.last_frost_start || !data.last_frost_end || !data.first_frost_start || !data.first_frost_end) {
    return null;
  }

  return {
    lastStart: data.last_frost_start,
    lastEnd: data.last_frost_end,
    firstStart: data.first_frost_start,
    firstEnd: data.first_frost_end
  };
}

export async function getLocationProfile(zip: string): Promise<LocationProfile> {
  const cached = await one<LocationProfile>(
    `SELECT zip, zone, last_frost_start::text, last_frost_end::text, first_frost_start::text,
            first_frost_end::text, season_length_days, source
     FROM location_profiles
     WHERE zip = $1 AND fetched_at > now() - interval '30 days'`,
    [zip]
  );

  if (cached) return cached;

  const [zone, frost] = await Promise.all([fetchZone(zip), fetchFrost(zip)]);

  const profile =
    zone && frost
      ? {
          zip,
          zone,
          last_frost_start: frost.lastStart,
          last_frost_end: frost.lastEnd,
          first_frost_start: frost.firstStart,
          first_frost_end: frost.firstEnd,
          season_length_days: dayjs(frost.firstStart).diff(dayjs(frost.lastEnd), 'day'),
          source: 'api'
        }
      : heuristicFromZone(zip, zone ?? '7a');

  await query(
    `INSERT INTO location_profiles
      (zip, zone, last_frost_start, last_frost_end, first_frost_start, first_frost_end, season_length_days, source, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (zip)
     DO UPDATE SET zone = EXCLUDED.zone,
                   last_frost_start = EXCLUDED.last_frost_start,
                   last_frost_end = EXCLUDED.last_frost_end,
                   first_frost_start = EXCLUDED.first_frost_start,
                   first_frost_end = EXCLUDED.first_frost_end,
                   season_length_days = EXCLUDED.season_length_days,
                   source = EXCLUDED.source,
                   fetched_at = now()`,
    [
      profile.zip,
      profile.zone,
      profile.last_frost_start,
      profile.last_frost_end,
      profile.first_frost_start,
      profile.first_frost_end,
      profile.season_length_days,
      profile.source
    ]
  );

  return profile;
}
