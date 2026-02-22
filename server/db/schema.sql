CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin text NOT NULL,
  destination text NOT NULL,
  miles numeric NOT NULL,
  contract_total_payout_cents bigint,
  status text NOT NULL CHECK (status IN ('OPEN','IN_TRANSIT','COMPLETE')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  current_lat numeric,
  current_lng numeric,
  hos_remaining_hours numeric,
  home_lat numeric,
  home_lng numeric
);

CREATE TABLE IF NOT EXISTS legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  sequence int NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  miles numeric NOT NULL,
  handoff_point text,
  rate_cents int NOT NULL,
  payout_per_mile_cents int,
  status text NOT NULL CHECK (status IN ('OPEN','IN_TRANSIT','COMPLETE')),
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  broker_name text NOT NULL,
  broker_email text NOT NULL,
  last_worked_together text
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leg_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id uuid NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  from_leg_id uuid NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  to_leg_id uuid NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  from_driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  to_driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('PENDING','READY','COMPLETE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_leg_id, to_leg_id)
);

CREATE INDEX IF NOT EXISTS legs_load_id_idx ON legs(load_id);
CREATE INDEX IF NOT EXISTS legs_status_idx ON legs(status);
CREATE INDEX IF NOT EXISTS contacts_driver_id_idx ON contacts(driver_id);
CREATE INDEX IF NOT EXISTS accounts_email_idx ON accounts(email);
CREATE INDEX IF NOT EXISTS accounts_driver_id_idx ON accounts(driver_id);
CREATE INDEX IF NOT EXISTS leg_events_leg_id_idx ON leg_events(leg_id);
CREATE INDEX IF NOT EXISTS handoffs_load_id_idx ON handoffs(load_id);
