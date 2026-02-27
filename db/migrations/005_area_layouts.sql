CREATE TABLE IF NOT EXISTS garden_area_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_space_id UUID NOT NULL REFERENCES garden_spaces(id) ON DELETE CASCADE,
  garden_area_id UUID NOT NULL REFERENCES garden_areas(id) ON DELETE CASCADE UNIQUE,
  x_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  y_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (x_pct >= 0 AND x_pct <= 100),
  CHECK (y_pct >= 0 AND y_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_area_layout_space ON garden_area_layouts(garden_space_id);
