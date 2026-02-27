import type { Handler } from '@netlify/functions';
import { one, query } from '../../src/lib/db/client';
import { generateBlueprintPdf } from '../../src/lib/services/pdf';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const { purchaseId } = JSON.parse(event.body ?? '{}') as { purchaseId?: string };
  if (!purchaseId) return { statusCode: 400, body: 'purchaseId is required' };

  const purchase = await one<{ id: string; garden_space_id: string }>(
    `SELECT id, garden_space_id FROM purchases WHERE id = $1 AND status = 'completed'`,
    [purchaseId]
  );

  if (!purchase) return { statusCode: 404, body: 'Purchase not found' };

  const rows = await query<{
    space_name: string;
    zip: string;
    zone: string;
    last_frost_start: string;
    last_frost_end: string;
    area_name: string;
    sqft: string;
    sun_exposure: string;
  }>(
    `SELECT gs.name AS space_name, gs.zip, lp.zone, lp.last_frost_start::text, lp.last_frost_end::text,
            ga.name AS area_name, ga.sqft::text, ga.sun_exposure::text
     FROM garden_spaces gs
     JOIN location_profiles lp ON lp.zip = gs.zip
     JOIN garden_areas ga ON ga.garden_space_id = gs.id
     WHERE gs.id = $1`,
    [purchase.garden_space_id]
  );

  if (rows.length === 0) return { statusCode: 404, body: 'Space data unavailable' };

  const pdfUrl = await generateBlueprintPdf({
    spaceName: rows[0].space_name,
    zip: rows[0].zip,
    zone: rows[0].zone,
    frostRange: `${rows[0].last_frost_start} to ${rows[0].last_frost_end}`,
    areas: rows.map((r) => ({ name: r.area_name, sqft: r.sqft, sun: r.sun_exposure })),
    recommendations: [],
    timeline: [
      { month: 'March', summary: 'Bed prep and compost.' },
      { month: 'April', summary: 'Early sowing and transplant prep.' },
      { month: 'May', summary: 'Main planting push.' }
    ],
    maintenance: ['Water deeply once or twice weekly', 'Remove spent blooms', 'Inspect pests weekly'],
    purchaseId
  });

  await query(`UPDATE purchases SET pdf_url = $1 WHERE id = $2`, [pdfUrl, purchaseId]);

  return { statusCode: 200, body: JSON.stringify({ pdfUrl }) };
};
