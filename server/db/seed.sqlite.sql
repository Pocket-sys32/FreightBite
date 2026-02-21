INSERT INTO drivers (id, name, email, current_lat, current_lng, hos_remaining_hours, home_lat, home_lng)
VALUES (
  'drv_demo_1',
  'Alex Rivera',
  'alex.rivera@example.com',
  41.8781,
  -87.6298,
  8.5,
  41.8781,
  -87.6298
);

INSERT INTO loads (id, origin, destination, miles, status)
VALUES (
  'load_demo_1',
  'Chicago, IL',
  'Indianapolis, IN',
  185,
  'OPEN'
);

INSERT INTO legs (id, load_id, sequence, origin, destination, miles, handoff_point, rate_cents, status)
VALUES (
  'leg_demo_1',
  'load_demo_1',
  1,
  'Chicago, IL',
  'Indianapolis, IN',
  185,
  'Gary, IN',
  65000,
  'OPEN'
);

INSERT INTO contacts (id, driver_id, broker_name, broker_email, last_worked_together)
VALUES (
  'contact_demo_1',
  'drv_demo_1',
  'Midwest Freight Co',
  'dispatch@midwestfreight.example',
  '2025-12-15'
);
