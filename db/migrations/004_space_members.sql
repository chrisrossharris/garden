DO $$
BEGIN
  CREATE TYPE space_role AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS space_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_space_id UUID NOT NULL REFERENCES garden_spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role space_role NOT NULL DEFAULT 'EDITOR',
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(garden_space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_space_members_space ON space_members(garden_space_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user ON space_members(user_id);
