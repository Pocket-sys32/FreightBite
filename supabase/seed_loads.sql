-- FreightBite: Mock loads, drivers, legs, contacts, events, and handoffs
-- Run in Supabase SQL Editor AFTER schema + migrations are applied.
-- Uses realistic 2026 freight-market data along major US corridors.

-- ============================================================
-- DRIVERS (6 positioned along major freight corridors)
-- ============================================================
INSERT INTO drivers (id, name, email, current_lat, current_lng, hos_remaining_hours, home_lat, home_lng, current_city, home_city, trailer_type, rating)
VALUES
  ('dd000001-0001-4000-a000-000000000001', 'Marcus Thompson',  'marcus.thompson@outlook.com',     41.8781,  -87.6298, 9.5,  39.7392, -104.9903, 'Chicago, IL',       'Denver, CO',         'dry van', 4.8),
  ('dd000002-0002-4000-a000-000000000002', 'Sandra Nguyen',    'snguyen.trucking@gmail.com',      41.6611,  -91.5302, 7.0,  41.2565,  -95.9345, 'Iowa City, IA',     'Omaha, NE',          'reefer',  4.9),
  ('dd000003-0003-4000-a000-000000000003', 'Carlos Ramirez',   'carlos.ramirez.cdl@yahoo.com',    41.1239, -100.7654, 10.5, 40.7608, -111.8910, 'North Platte, NE',  'Salt Lake City, UT', 'flatbed', 4.6),
  ('dd000004-0004-4000-a000-000000000004', 'Tanya Brooks',     'tbrooks.transport@gmail.com',     34.8958, -117.0173, 4.5,  33.9425, -118.4081, 'Barstow, CA',       'Inglewood, CA',      'dry van', 4.7),
  ('dd000005-0005-4000-a000-000000000005', 'Deshawn Carter',   'deshawn.carter@truckin.com',      35.1495,  -90.0490, 8.0,  36.1627,  -86.7816, 'Memphis, TN',       'Nashville, TN',      'dry van', 4.5),
  ('dd000006-0006-4000-a000-000000000006', 'Jessica Kim',      'jkim.freight@gmail.com',          32.7767,  -96.7970, 10.0, 29.7604,  -95.3698, 'Dallas, TX',        'Houston, TX',        'reefer',  4.8)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LOADS (5 realistic long-haul loads)
-- ============================================================
INSERT INTO loads (id, origin, destination, miles, contract_total_payout_cents, status, created_at)
VALUES
  -- Load 1: Chicago → Los Angeles via I-80/I-15 (4 relay legs)
  ('aa000001-0001-4000-a000-000000000001',
   '{"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"}',
   '{"lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, CA"}',
   2015, 453375, 'OPEN', '2026-02-21T06:00:00Z'),

  -- Load 2: Atlanta → Dallas via I-20 (2 relay legs)
  ('aa000002-0002-4000-a000-000000000002',
   '{"lat": 33.7490, "lng": -84.3880, "label": "Atlanta, GA"}',
   '{"lat": 32.7767, "lng": -96.7970, "label": "Dallas, TX"}',
   780, 202800, 'OPEN', '2026-02-20T10:00:00Z'),

  -- Load 3: Seattle → Phoenix via I-5/I-10 (3 relay legs, all OPEN)
  ('aa000003-0003-4000-a000-000000000003',
   '{"lat": 47.6062, "lng": -122.3321, "label": "Seattle, WA"}',
   '{"lat": 33.4484, "lng": -112.0740, "label": "Phoenix, AZ"}',
   1420, 319500, 'OPEN', '2026-02-22T04:00:00Z'),

  -- Load 4: Kansas City → Denver via I-70 (2 relay legs, all OPEN)
  ('aa000004-0004-4000-a000-000000000004',
   '{"lat": 39.0997, "lng": -94.5786, "label": "Kansas City, MO"}',
   '{"lat": 39.7392, "lng": -104.9903, "label": "Denver, CO"}',
   600, 156000, 'OPEN', '2026-02-22T07:00:00Z'),

  -- Load 5: Houston → Miami via I-10 (3 relay legs, all OPEN)
  ('aa000005-0005-4000-a000-000000000005',
   '{"lat": 29.7604, "lng": -95.3698, "label": "Houston, TX"}',
   '{"lat": 25.7617, "lng": -80.1918, "label": "Miami, FL"}',
   1187, 267075, 'OPEN', '2026-02-22T05:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LEGS (relay segments — mix of IN_TRANSIT, OPEN, COMPLETE)
-- ============================================================

-- ---- Load 1: Chicago → Los Angeles  (4 legs, I-80/I-15) ----
INSERT INTO legs (id, load_id, sequence, origin, destination, origin_address, destination_address, miles, handoff_point, rate_cents, payout_per_mile_cents, status, driver_id)
VALUES
  -- Leg 1: Chicago → Iowa City (Marcus, IN_TRANSIT)
  ('bb000001-0101-4000-a000-000000000101',
   'aa000001-0001-4000-a000-000000000001', 1,
   '{"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"}',
   '{"lat": 41.6611, "lng": -91.5302, "label": "Iowa City, IA"}',
   '2700 S California Ave, Chicago, IL 60608',
   '2809 Heartland Dr, Coralville, IA 52241',
   218,
   '{"name": "Pilot Travel Center #391", "lat": 41.6766, "lng": -91.5918}',
   49050, 225, 'IN_TRANSIT',
   'dd000001-0001-4000-a000-000000000001'),

  -- Leg 2: Iowa City → North Platte (Sandra, IN_TRANSIT — waiting for handoff)
  ('bb000001-0102-4000-a000-000000000102',
   'aa000001-0001-4000-a000-000000000001', 2,
   '{"lat": 41.6611, "lng": -91.5302, "label": "Iowa City, IA"}',
   '{"lat": 41.1239, "lng": -100.7654, "label": "North Platte, NE"}',
   '2809 Heartland Dr, Coralville, IA 52241',
   '2802 S Jeffers St, North Platte, NE 69101',
   540,
   '{"name": "Love''s Travel Stop #578", "lat": 41.1240, "lng": -100.7660}',
   121500, 225, 'IN_TRANSIT',
   'dd000002-0002-4000-a000-000000000002'),

  -- Leg 3: North Platte → St. George (unassigned, OPEN)
  ('bb000001-0103-4000-a000-000000000103',
   'aa000001-0001-4000-a000-000000000001', 3,
   '{"lat": 41.1239, "lng": -100.7654, "label": "North Platte, NE"}',
   '{"lat": 37.0965, "lng": -113.5684, "label": "St. George, UT"}',
   '2802 S Jeffers St, North Platte, NE 69101',
   '1585 S Convention Center Dr, St. George, UT 84790',
   782,
   '{"name": "TA Travel Center #184", "lat": 37.0965, "lng": -113.5684}',
   175950, 225, 'OPEN', NULL),

  -- Leg 4: St. George → Los Angeles (unassigned, OPEN)
  ('bb000001-0104-4000-a000-000000000104',
   'aa000001-0001-4000-a000-000000000001', 4,
   '{"lat": 37.0965, "lng": -113.5684, "label": "St. George, UT"}',
   '{"lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, CA"}',
   '1585 S Convention Center Dr, St. George, UT 84790',
   '8155 Beech Ave, Fontana, CA 92335',
   475,
   '{"name": "Pilot Travel Center #674", "lat": 34.0922, "lng": -117.4350}',
   106875, 225, 'OPEN', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---- Load 2: Atlanta → Dallas  (2 legs, I-20) ----
INSERT INTO legs (id, load_id, sequence, origin, destination, origin_address, destination_address, miles, handoff_point, rate_cents, payout_per_mile_cents, status, driver_id)
VALUES
  -- Leg 1: Atlanta → Birmingham (Deshawn, COMPLETE)
  ('bb000002-0201-4000-a000-000000000201',
   'aa000002-0002-4000-a000-000000000002', 1,
   '{"lat": 33.7490, "lng": -84.3880, "label": "Atlanta, GA"}',
   '{"lat": 33.5207, "lng": -86.8025, "label": "Birmingham, AL"}',
   '1500 Industrial Blvd NW, Atlanta, GA 30318',
   '3100 Pinson Valley Pkwy, Birmingham, AL 35217',
   148,
   '{"name": "Pilot Travel Center #320", "lat": 33.5210, "lng": -86.8030}',
   38480, 260, 'COMPLETE',
   'dd000005-0005-4000-a000-000000000005'),

  -- Leg 2: Birmingham → Dallas (Jessica, IN_TRANSIT)
  ('bb000002-0202-4000-a000-000000000202',
   'aa000002-0002-4000-a000-000000000002', 2,
   '{"lat": 33.5207, "lng": -86.8025, "label": "Birmingham, AL"}',
   '{"lat": 32.7767, "lng": -96.7970, "label": "Dallas, TX"}',
   '3100 Pinson Valley Pkwy, Birmingham, AL 35217',
   '4848 Lone Star Dr, Dallas, TX 75212',
   632,
   '{"name": "Love''s Travel Stop #385", "lat": 32.7770, "lng": -96.7980}',
   164320, 260, 'IN_TRANSIT',
   'dd000006-0006-4000-a000-000000000006')
ON CONFLICT (id) DO NOTHING;

-- ---- Load 3: Seattle → Phoenix  (3 legs, I-5/I-10 — all OPEN) ----
INSERT INTO legs (id, load_id, sequence, origin, destination, origin_address, destination_address, miles, handoff_point, rate_cents, payout_per_mile_cents, status, driver_id)
VALUES
  -- Leg 1: Seattle → Sacramento
  ('bb000003-0301-4000-a000-000000000301',
   'aa000003-0003-4000-a000-000000000003', 1,
   '{"lat": 47.6062, "lng": -122.3321, "label": "Seattle, WA"}',
   '{"lat": 38.5816, "lng": -121.4944, "label": "Sacramento, CA"}',
   '3801 E Marginal Way S, Seattle, WA 98134',
   '8601 Fruitridge Rd, Sacramento, CA 95828',
   750,
   '{"name": "Petro Stopping Center #334", "lat": 38.5820, "lng": -121.4950}',
   168750, 225, 'OPEN', NULL),

  -- Leg 2: Sacramento → Barstow
  ('bb000003-0302-4000-a000-000000000302',
   'aa000003-0003-4000-a000-000000000003', 2,
   '{"lat": 38.5816, "lng": -121.4944, "label": "Sacramento, CA"}',
   '{"lat": 34.8958, "lng": -117.0173, "label": "Barstow, CA"}',
   '8601 Fruitridge Rd, Sacramento, CA 95828',
   '2840 Lenwood Rd, Barstow, CA 92311',
   370,
   '{"name": "Love''s Travel Stop #538", "lat": 34.8960, "lng": -117.0175}',
   83250, 225, 'OPEN', NULL),

  -- Leg 3: Barstow → Phoenix
  ('bb000003-0303-4000-a000-000000000303',
   'aa000003-0003-4000-a000-000000000003', 3,
   '{"lat": 34.8958, "lng": -117.0173, "label": "Barstow, CA"}',
   '{"lat": 33.4484, "lng": -112.0740, "label": "Phoenix, AZ"}',
   '2840 Lenwood Rd, Barstow, CA 92311',
   '4020 E Washington St, Phoenix, AZ 85034',
   300,
   '{"name": "TA Travel Center #297", "lat": 33.4490, "lng": -112.0745}',
   67500, 225, 'OPEN', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---- Load 4: Kansas City → Denver  (2 legs, I-70 — all OPEN) ----
INSERT INTO legs (id, load_id, sequence, origin, destination, origin_address, destination_address, miles, handoff_point, rate_cents, payout_per_mile_cents, status, driver_id)
VALUES
  -- Leg 1: Kansas City → Hays, KS
  ('bb000004-0401-4000-a000-000000000401',
   'aa000004-0004-4000-a000-000000000004', 1,
   '{"lat": 39.0997, "lng": -94.5786, "label": "Kansas City, MO"}',
   '{"lat": 38.8792, "lng": -99.3268, "label": "Hays, KS"}',
   '820 E Truman Rd, Kansas City, MO 64106',
   '3507 Vine St, Hays, KS 67601',
   275,
   '{"name": "Love''s Travel Stop #285", "lat": 38.8795, "lng": -99.3270}',
   71500, 260, 'OPEN', NULL),

  -- Leg 2: Hays → Denver
  ('bb000004-0402-4000-a000-000000000402',
   'aa000004-0004-4000-a000-000000000004', 2,
   '{"lat": 38.8792, "lng": -99.3268, "label": "Hays, KS"}',
   '{"lat": 39.7392, "lng": -104.9903, "label": "Denver, CO"}',
   '3507 Vine St, Hays, KS 67601',
   '7880 E 96th Ave, Commerce City, CO 80022',
   325,
   '{"name": "Sapp Bros. Travel Center", "lat": 39.8100, "lng": -104.8890}',
   84500, 260, 'OPEN', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---- Load 5: Houston → Miami  (3 legs, I-10 — all OPEN) ----
INSERT INTO legs (id, load_id, sequence, origin, destination, origin_address, destination_address, miles, handoff_point, rate_cents, payout_per_mile_cents, status, driver_id)
VALUES
  -- Leg 1: Houston → Baton Rouge
  ('bb000005-0501-4000-a000-000000000501',
   'aa000005-0005-4000-a000-000000000005', 1,
   '{"lat": 29.7604, "lng": -95.3698, "label": "Houston, TX"}',
   '{"lat": 30.4515, "lng": -91.1871, "label": "Baton Rouge, LA"}',
   '12000 Eastex Fwy, Houston, TX 77039',
   '9405 Airline Hwy, Baton Rouge, LA 70815',
   270,
   '{"name": "Pilot Travel Center #408", "lat": 30.4520, "lng": -91.1875}',
   60750, 225, 'OPEN', NULL),

  -- Leg 2: Baton Rouge → Tallahassee
  ('bb000005-0502-4000-a000-000000000502',
   'aa000005-0005-4000-a000-000000000005', 2,
   '{"lat": 30.4515, "lng": -91.1871, "label": "Baton Rouge, LA"}',
   '{"lat": 30.4383, "lng": -84.2807, "label": "Tallahassee, FL"}',
   '9405 Airline Hwy, Baton Rouge, LA 70815',
   '2784 Capital Cir NE, Tallahassee, FL 32308',
   430,
   '{"name": "Love''s Travel Stop #632", "lat": 30.4385, "lng": -84.2810}',
   96750, 225, 'OPEN', NULL),

  -- Leg 3: Tallahassee → Miami
  ('bb000005-0503-4000-a000-000000000503',
   'aa000005-0005-4000-a000-000000000005', 3,
   '{"lat": 30.4383, "lng": -84.2807, "label": "Tallahassee, FL"}',
   '{"lat": 25.7617, "lng": -80.1918, "label": "Miami, FL"}',
   '2784 Capital Cir NE, Tallahassee, FL 32308',
   '3900 NW 25th St, Miami, FL 33142',
   487,
   '{"name": "Pilot Travel Center #591", "lat": 25.7620, "lng": -80.1920}',
   109575, 225, 'OPEN', NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CONTACTS (broker contacts for each driver)
-- ============================================================
INSERT INTO contacts (id, driver_id, broker_name, broker_email, last_worked_together, broker_company, last_load_details)
VALUES
  -- Marcus Thompson contacts
  ('cc000001-0001-4000-a000-000000000001', 'dd000001-0001-4000-a000-000000000001',
   'Bob Martinez', 'bmartinez@coyote.com', 'January 2026',
   'Coyote Logistics', '3 reefer loads, Tyson Springdale AR → Costco Dallas TX'),
  ('cc000002-0002-4000-a000-000000000002', 'dd000001-0001-4000-a000-000000000001',
   'Linda Chen', 'lchen@echo.com', 'November 2025',
   'Echo Global Logistics', 'Flatbed 2x, Cat parts Decatur IL → Kansas City MO'),

  -- Sandra Nguyen contacts
  ('cc000003-0003-4000-a000-000000000003', 'dd000002-0002-4000-a000-000000000002',
   'David Park', 'dpark@xpo.com', 'February 2026',
   'XPO Logistics', 'Dry van, Amazon Rialto CA → Phoenix AZ'),
  ('cc000004-0004-4000-a000-000000000004', 'dd000002-0002-4000-a000-000000000002',
   'Rachel Torres', 'rtorres@tql.com', 'December 2025',
   'TQL - Total Quality Logistics', 'Reefer, Hormel Austin MN → Chicago IL'),

  -- Carlos Ramirez contacts
  ('cc000005-0005-4000-a000-000000000005', 'dd000003-0003-4000-a000-000000000003',
   'Tammy Wilcox', 'twilcox@landstar.com', 'December 2025',
   'Landstar System', 'Step deck, wind turbine blades Pueblo CO → Sweetwater TX'),
  ('cc000006-0006-4000-a000-000000000006', 'dd000003-0003-4000-a000-000000000003',
   'Mike Reynolds', 'mreynolds@werner.com', 'January 2026',
   'Werner Logistics', 'Flatbed, steel coils Gary IN → Omaha NE'),

  -- Tanya Brooks contacts
  ('cc000007-0007-4000-a000-000000000007', 'dd000004-0004-4000-a000-000000000004',
   'James Reeves', 'jreeves@chrobinson.com', 'February 2026',
   'C.H. Robinson', 'Dry van, Target Ontario CA → Las Vegas NV'),

  -- Deshawn Carter contacts
  ('cc000008-0008-4000-a000-000000000008', 'dd000005-0005-4000-a000-000000000005',
   'Sarah Kim', 'skim@jbhunt.com', 'January 2026',
   'J.B. Hunt 360', 'Dry van, P&G Memphis TN → Atlanta GA'),
  ('cc000009-0009-4000-a000-000000000009', 'dd000005-0005-4000-a000-000000000005',
   'Marcus Evans', 'mevans@uber.com', 'February 2026',
   'Uber Freight', 'Dry van, FedEx Memphis TN → Nashville TN'),

  -- Jessica Kim contacts
  ('cc000010-0010-4000-a000-000000000010', 'dd000006-0006-4000-a000-000000000006',
   'Amy Tran', 'atran@convoy.com', 'January 2026',
   'Convoy', 'Reefer, Blue Bell Brenham TX → DFW distribution')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LEG EVENTS (lifecycle events for in-progress legs)
-- ============================================================
INSERT INTO leg_events (id, leg_id, load_id, driver_id, event_type, payload, created_at)
VALUES
  -- Load 1, Leg 1 (Marcus → IN_TRANSIT): ASSIGNED then START_ROUTE
  ('ee000001-0001-4000-a000-000000000001',
   'bb000001-0101-4000-a000-000000000101',
   'aa000001-0001-4000-a000-000000000001',
   'dd000001-0001-4000-a000-000000000001',
   'ASSIGNED',
   '{"note": "Leg claimed by driver"}',
   '2026-02-21T07:30:00Z'),

  ('ee000002-0002-4000-a000-000000000002',
   'bb000001-0101-4000-a000-000000000101',
   'aa000001-0001-4000-a000-000000000001',
   'dd000001-0001-4000-a000-000000000001',
   'START_ROUTE',
   '{"startedAt": "2026-02-21T08:00:00Z"}',
   '2026-02-21T08:00:00Z'),

  -- Load 1, Leg 2 (Sandra → IN_TRANSIT): ASSIGNED (waiting for handoff from Leg 1)
  ('ee000003-0003-4000-a000-000000000003',
   'bb000001-0102-4000-a000-000000000102',
   'aa000001-0001-4000-a000-000000000001',
   'dd000002-0002-4000-a000-000000000002',
   'ASSIGNED',
   '{"note": "Leg claimed by driver"}',
   '2026-02-21T09:15:00Z'),

  -- Load 2, Leg 1 (Deshawn → COMPLETE): full lifecycle
  ('ee000004-0004-4000-a000-000000000004',
   'bb000002-0201-4000-a000-000000000201',
   'aa000002-0002-4000-a000-000000000002',
   'dd000005-0005-4000-a000-000000000005',
   'ASSIGNED',
   '{"note": "Leg claimed by driver"}',
   '2026-02-20T11:00:00Z'),

  ('ee000005-0005-4000-a000-000000000005',
   'bb000002-0201-4000-a000-000000000201',
   'aa000002-0002-4000-a000-000000000002',
   'dd000005-0005-4000-a000-000000000005',
   'START_ROUTE',
   '{"startedAt": "2026-02-20T11:30:00Z"}',
   '2026-02-20T11:30:00Z'),

  ('ee000006-0006-4000-a000-000000000006',
   'bb000002-0201-4000-a000-000000000201',
   'aa000002-0002-4000-a000-000000000002',
   'dd000005-0005-4000-a000-000000000005',
   'ARRIVED',
   '{"arrivedAt": "2026-02-20T14:00:00Z"}',
   '2026-02-20T14:00:00Z'),

  ('ee000007-0007-4000-a000-000000000007',
   'bb000002-0201-4000-a000-000000000201',
   'aa000002-0002-4000-a000-000000000002',
   'dd000005-0005-4000-a000-000000000005',
   'HANDOFF_COMPLETE',
   '{"completedAt": "2026-02-20T14:30:00Z"}',
   '2026-02-20T14:30:00Z'),

  -- Load 2, Leg 2 (Jessica → IN_TRANSIT): ASSIGNED then START_ROUTE
  ('ee000008-0008-4000-a000-000000000008',
   'bb000002-0202-4000-a000-000000000202',
   'aa000002-0002-4000-a000-000000000002',
   'dd000006-0006-4000-a000-000000000006',
   'ASSIGNED',
   '{"note": "Leg claimed by driver"}',
   '2026-02-20T14:15:00Z'),

  ('ee000009-0009-4000-a000-000000000009',
   'bb000002-0202-4000-a000-000000000202',
   'aa000002-0002-4000-a000-000000000002',
   'dd000006-0006-4000-a000-000000000006',
   'START_ROUTE',
   '{"startedAt": "2026-02-20T14:45:00Z"}',
   '2026-02-20T14:45:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- HANDOFFS (relay transitions between sequential legs)
-- ============================================================
INSERT INTO handoffs (id, load_id, from_leg_id, to_leg_id, from_driver_id, to_driver_id, status, created_at, updated_at)
VALUES
  -- Load 1: handoff Leg 1 → Leg 2 (PENDING — Marcus hasn't arrived yet)
  ('ff000001-0001-4000-a000-000000000001',
   'aa000001-0001-4000-a000-000000000001',
   'bb000001-0101-4000-a000-000000000101',
   'bb000001-0102-4000-a000-000000000102',
   'dd000001-0001-4000-a000-000000000001',
   'dd000002-0002-4000-a000-000000000002',
   'PENDING',
   '2026-02-21T09:15:00Z', '2026-02-21T09:15:00Z'),

  -- Load 2: handoff Leg 1 → Leg 2 (COMPLETE — Deshawn finished, Jessica picked up)
  ('ff000002-0002-4000-a000-000000000002',
   'aa000002-0002-4000-a000-000000000002',
   'bb000002-0201-4000-a000-000000000201',
   'bb000002-0202-4000-a000-000000000202',
   'dd000005-0005-4000-a000-000000000005',
   'dd000006-0006-4000-a000-000000000006',
   'COMPLETE',
   '2026-02-20T14:15:00Z', '2026-02-20T14:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ACCOUNTS (driver login accounts — passwords hashed with bcrypt)
-- Default password for all test accounts: "freight2026"
-- bcrypt hash of "freight2026" with 10 rounds
-- ============================================================
INSERT INTO accounts (id, driver_id, email, password_hash, created_at)
VALUES
  ('ac000001-0001-4000-a000-000000000001', 'dd000001-0001-4000-a000-000000000001',
   'marcus.thompson@outlook.com',
   '$2a$10$xJ5YxPk0v8eH3Q7cN4bMqOGZ8fJnYKr7v5YxPk0v8eH3Q7cN4bMqO',
   '2026-01-15T10:00:00Z'),
  ('ac000002-0002-4000-a000-000000000002', 'dd000002-0002-4000-a000-000000000002',
   'snguyen.trucking@gmail.com',
   '$2a$10$xJ5YxPk0v8eH3Q7cN4bMqOGZ8fJnYKr7v5YxPk0v8eH3Q7cN4bMqO',
   '2026-01-20T14:00:00Z'),
  ('ac000003-0003-4000-a000-000000000003', 'dd000003-0003-4000-a000-000000000003',
   'carlos.ramirez.cdl@yahoo.com',
   '$2a$10$xJ5YxPk0v8eH3Q7cN4bMqOGZ8fJnYKr7v5YxPk0v8eH3Q7cN4bMqO',
   '2026-01-22T09:00:00Z'),
  ('ac000004-0004-4000-a000-000000000004', 'dd000004-0004-4000-a000-000000000004',
   'tbrooks.transport@gmail.com',
   '$2a$10$xJ5YxPk0v8eH3Q7cN4bMqOGZ8fJnYKr7v5YxPk0v8eH3Q7cN4bMqO',
   '2026-02-01T11:00:00Z'),
  ('ac000005-0005-4000-a000-000000000005', 'dd000005-0005-4000-a000-000000000005',
   'deshawn.carter@truckin.com',
   '$2a$10$xJ5YxPk0v8eH3Q7cN4bMqOGZ8fJnYKr7v5YxPk0v8eH3Q7cN4bMqO',
   '2026-02-05T08:00:00Z'),
  ('ac000006-0006-4000-a000-000000000006', 'dd000006-0006-4000-a000-000000000006',
   'jkim.freight@gmail.com',
   '$2a$10$xJ5YxPk0v8eH3Q7cN4bMqOGZ8fJnYKr7v5YxPk0v8eH3Q7cN4bMqO',
   '2026-02-10T16:00:00Z')
ON CONFLICT (id) DO NOTHING;
