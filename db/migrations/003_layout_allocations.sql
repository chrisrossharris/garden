DO $$
BEGIN
  CREATE TYPE bed_zone AS ENUM ('border', 'center', 'trellis');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS garden_layout_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_area_id UUID NOT NULL REFERENCES garden_areas(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  zone bed_zone NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(garden_area_id, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_layout_area ON garden_layout_allocations(garden_area_id);
