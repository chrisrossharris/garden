import { query } from '@/lib/db/client';

export function estimateCapacity(sqft: number, spacingInches: number): number {
  const bedSqInches = sqft * 144;
  const spacingArea = spacingInches * spacingInches;
  return Math.floor(bedSqInches / spacingArea);
}

export async function listPlants(filters: {
  search?: string;
  category?: string;
  sun?: 'full_sun' | 'part_sun' | 'shade';
}) {
  const values: unknown[] = [];
  const where: string[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(common_name ILIKE $${values.length} OR COALESCE(botanical_name,'') ILIKE $${values.length})`);
  }
  if (filters.category) {
    values.push(filters.category);
    where.push(`category = $${values.length}`);
  }
  if (filters.sun) {
    values.push(filters.sun);
    where.push(`sun = $${values.length}`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return query<{
    id: string;
    common_name: string;
    category: string;
    spacing_inches: number;
    sun: 'full_sun' | 'part_sun' | 'shade';
    is_native: boolean;
    notes: string | null;
  }>(
    `SELECT id, common_name, category, spacing_inches, sun, is_native, notes
     FROM plants
     ${clause}
     ORDER BY common_name ASC`,
    values
  );
}

export async function addPlanting(input: { areaId: string; plantId: string; quantity: number; notes?: string }) {
  await query(
    `INSERT INTO garden_plantings (garden_area_id, plant_id, quantity, notes)
     VALUES ($1, $2, $3, $4)`,
    [input.areaId, input.plantId, input.quantity, input.notes ?? null]
  );
}

export async function getPlanForSpace(spaceId: string) {
  return query<{
    area_id: string;
    area_name: string;
    area_sqft: string;
    sun_exposure: 'full_sun' | 'part_sun' | 'shade';
    planting_id: string | null;
    plant_id: string | null;
    common_name: string | null;
    category: string | null;
    spacing_inches: number | null;
    plant_sun: 'full_sun' | 'part_sun' | 'shade' | null;
    quantity: number | null;
  }>(
    `SELECT
       a.id AS area_id,
       a.name AS area_name,
       a.sqft::text AS area_sqft,
       a.sun_exposure,
       gp.id AS planting_id,
       p.id AS plant_id,
       p.common_name,
       p.category,
       p.spacing_inches,
       p.sun AS plant_sun,
       gp.quantity
     FROM garden_areas a
     LEFT JOIN garden_plantings gp ON gp.garden_area_id = a.id
     LEFT JOIN plants p ON p.id = gp.plant_id
     WHERE a.garden_space_id = $1
     ORDER BY a.created_at, p.common_name NULLS LAST`,
    [spaceId]
  );
}

export async function listLayoutAllocationsForSpace(spaceId: string) {
  try {
    return await query<{
      area_id: string;
      plant_id: string;
      plant_name: string;
      category: string;
      zone: 'border' | 'center' | 'trellis';
      quantity: number;
    }>(
      `SELECT
        ga.id AS area_id,
        p.id AS plant_id,
        p.common_name AS plant_name,
        p.category,
        gla.zone::text AS zone,
        gla.quantity
       FROM garden_layout_allocations gla
       JOIN garden_areas ga ON ga.id = gla.garden_area_id
       JOIN plants p ON p.id = gla.plant_id
       WHERE ga.garden_space_id = $1`,
      [spaceId]
    );
  } catch (error) {
    // Migration not applied yet; keep planner usable without persistent layout.
    if ((error as { code?: string }).code === '42P01') {
      return [];
    }
    throw error;
  }
}
