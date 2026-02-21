-- Relay Haul / FreightBite schema (run in Supabase SQL Editor)
-- https://supabase.com/dashboard/project/_/sql

-- Loads
create table if not exists loads (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  destination text not null,
  miles numeric,
  status text default 'pending',
  created_at timestamptz default now()
);

-- Drivers (before legs, so legs.driver_id can reference)
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  current_lat numeric,
  current_lng numeric,
  hos_remaining_hours numeric,
  home_lat numeric,
  home_lng numeric,
  created_at timestamptz default now()
);

-- Legs (relay segments of a load)
create table if not exists legs (
  id uuid primary key default gen_random_uuid(),
  load_id uuid references loads(id) on delete cascade,
  sequence int not null,
  origin text not null,
  destination text not null,
  miles numeric,
  handoff_point text,
  rate_cents int,
  status text default 'open',
  driver_id uuid references drivers(id),
  created_at timestamptz default now()
);

-- Contacts (from email extraction)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  broker_name text,
  broker_email text,
  last_worked_together text,
  created_at timestamptz default now()
);

-- Optional: enable RLS and policies as needed
-- (Uncomment when you add auth)
-- alter table loads enable row level security;
-- alter table legs enable row level security;
-- alter table drivers enable row level security;
-- alter table contacts enable row level security;
