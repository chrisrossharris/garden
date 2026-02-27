CREATE TYPE sun_exposure AS ENUM ('full_sun', 'part_sun', 'shade');
CREATE TYPE task_status AS ENUM ('todo', 'done', 'snoozed');
CREATE TYPE delivery_type AS ENUM ('in_app', 'email', 'push');
CREATE TYPE event_type AS ENUM ('LAST_FROST', 'FIRST_FROST');
CREATE TYPE purchase_kind AS ENUM ('BLUEPRINT');
CREATE TYPE subscription_plan AS ENUM ('BASIC', 'PLUS', 'ULTRA');

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garden_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zip TEXT NOT NULL,
  address_json JSONB,
  total_sqft NUMERIC(10,2) NOT NULL DEFAULT 0,
  goals_json JSONB,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garden_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_space_id UUID NOT NULL REFERENCES garden_spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  sqft NUMERIC(10,2) NOT NULL,
  sun_exposure sun_exposure NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip TEXT UNIQUE NOT NULL,
  zone TEXT NOT NULL,
  last_frost_start DATE NOT NULL,
  last_frost_end DATE NOT NULL,
  first_frost_start DATE NOT NULL,
  first_frost_end DATE NOT NULL,
  season_length_days INT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  common_name TEXT NOT NULL,
  botanical_name TEXT,
  category TEXT NOT NULL,
  spacing_inches INT NOT NULL,
  sun sun_exposure NOT NULL,
  water TEXT NOT NULL,
  bloom_months INT[],
  harvest_months INT[],
  height_inches INT,
  spread_inches INT,
  is_native BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_custom BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plants_name_botanical ON plants(common_name, COALESCE(botanical_name, ''));

CREATE TABLE IF NOT EXISTS garden_plantings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_area_id UUID NOT NULL REFERENCES garden_areas(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES plants(id),
  quantity INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  offset_days_from_event INT NOT NULL,
  event_type event_type NOT NULL,
  instructions TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_templates_unique ON task_templates(plant_id, kind, event_type, offset_days_from_event);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_space_id UUID NOT NULL REFERENCES garden_spaces(id) ON DELETE CASCADE,
  planting_id UUID REFERENCES garden_plantings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  due_start DATE,
  due_end DATE,
  status task_status NOT NULL DEFAULT 'todo',
  delivery delivery_type NOT NULL DEFAULT 'in_app',
  instructions TEXT,
  sent_at TIMESTAMPTZ,
  auto_generated BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  garden_space_id UUID NOT NULL REFERENCES garden_spaces(id) ON DELETE CASCADE,
  kind purchase_kind NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plan subscription_plan NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  channel delivery_type NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON garden_spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_areas_space_id ON garden_areas(garden_space_id);
CREATE INDEX IF NOT EXISTS idx_tasks_space_due ON tasks(garden_space_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);
