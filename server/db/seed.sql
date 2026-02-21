INSERT INTO drivers (id, name, email, current_lat, current_lng, hos_remaining_hours, home_lat, home_lng)
VALUES (
  gen_random_uuid(),
  'Alex Rivera',
  'alex.rivera@example.com',
  41.8781,
  -87.6298,
  8.5,
  41.8781,
  -87.6298
);

WITH new_load AS (
  INSERT INTO loads (id, origin, destination, miles, status)
  VALUES (gen_random_uuid(), 'Chicago, IL', 'Indianapolis, IN', 185, 'OPEN')
  RETURNING id
)
INSERT INTO legs (id, load_id, sequence, origin, destination, miles, handoff_point, rate_cents, status)
SELECT
  gen_random_uuid(),
  new_load.id,
  1,
  'Chicago, IL',
  'Indianapolis, IN',
  185,
  'Gary, IN',
  65000,
  'OPEN'
FROM new_load;

INSERT INTO contacts (id, driver_id, broker_name, broker_email, last_worked_together)
SELECT
  gen_random_uuid(),
  id,
  'Midwest Freight Co',
  'dispatch@midwestfreight.example',
  '2025-12-15'
FROM drivers
LIMIT 1;
