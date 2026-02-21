CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin text NOT NULL,
  destination text NOT NULL,
  miles numeric NOT NULL,
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

CREATE INDEX IF NOT EXISTS legs_load_id_idx ON legs(load_id);
CREATE INDEX IF NOT EXISTS legs_status_idx ON legs(status);
CREATE INDEX IF NOT EXISTS contacts_driver_id_idx ON contacts(driver_id);
