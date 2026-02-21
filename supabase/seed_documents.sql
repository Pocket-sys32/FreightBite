-- Seed data: Demo companies, contracts, and rates for AI dispatcher testing

-- ============================================================
-- COMPANIES
-- ============================================================
INSERT INTO companies (id, name, mc_number, dot_number, company_type, city, state, phone, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Swift Brokerage', 'MC-123456', 'DOT-789012', 'broker', 'Phoenix', 'AZ', '602-555-0100', 'dispatch@swiftbrokerage.com'),
  ('a2222222-2222-2222-2222-222222222222', 'MidWest Freight Solutions', 'MC-234567', 'DOT-890123', 'broker', 'Kansas City', 'MO', '816-555-0200', 'loads@midwestfreight.com'),
  ('a3333333-3333-3333-3333-333333333333', 'Great Plains Carrier Inc', 'MC-345678', 'DOT-901234', 'carrier', 'Omaha', 'NE', '402-555-0300', 'ops@greatplainscarrier.com'),
  ('a4444444-4444-4444-4444-444444444444', 'Pacific Coast Logistics', 'MC-456789', 'DOT-012345', 'broker', 'Los Angeles', 'CA', '310-555-0400', 'freight@pacificcoast.com'),
  ('a5555555-5555-5555-5555-555555555555', 'Heartland Shipping Co', 'MC-567890', 'DOT-123456', 'carrier', 'Des Moines', 'IA', '515-555-0500', 'dispatch@heartlandship.com');

-- ============================================================
-- DOCUMENTS (simulating uploaded rate sheets/contracts)
-- ============================================================
INSERT INTO documents (id, filename, document_type, status, uploaded_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'swift_brokerage_rate_sheet_2025.pdf', 'rate_sheet', 'extracted', NOW() - INTERVAL '30 days'),
  ('d2222222-2222-2222-2222-222222222222', 'midwest_freight_carrier_agreement.pdf', 'contract', 'extracted', NOW() - INTERVAL '60 days'),
  ('d3333333-3333-3333-3333-333333333333', 'pacific_coast_rate_confirmation.pdf', 'rate_sheet', 'extracted', NOW() - INTERVAL '15 days'),
  ('d4444444-4444-4444-4444-444444444444', 'heartland_master_agreement.pdf', 'contract', 'extracted', NOW() - INTERVAL '90 days');

-- ============================================================
-- CONTRACTS
-- ============================================================
INSERT INTO contracts (id, document_id, company_id, contract_type, status, effective_date, expiration_date, payment_terms, equipment_types) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'broker_carrier', 'active', '2025-01-01', '2026-06-30', 'Net 30', '{dry_van,reefer}'),
  ('c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'carrier_agreement', 'active', '2025-03-01', '2026-03-01', 'Net 15', '{dry_van,flatbed}'),
  ('c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444', 'rate_confirmation', 'active', '2025-06-01', '2026-01-01', 'Quick Pay 2%', '{dry_van,reefer}'),
  ('c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'a5555555-5555-5555-5555-555555555555', 'master_agreement', 'active', '2025-01-15', '2027-01-15', 'Net 30', '{dry_van,reefer,flatbed}');

-- ============================================================
-- RATES (lane-specific pricing)
-- ============================================================
INSERT INTO rates (contract_id, document_id, company_id, origin_city, origin_state, destination_city, destination_state, rate_type, rate_amount, fuel_surcharge, equipment_type, effective_date, expiration_date) VALUES
  -- Swift Brokerage rates
  ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Chicago', 'IL', 'Los Angeles', 'CA', 'per_mile', 2.85, 0.65, 'dry_van', '2025-01-01', '2026-06-30'),
  ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Chicago', 'IL', 'Denver', 'CO', 'per_mile', 2.70, 0.65, 'dry_van', '2025-01-01', '2026-06-30'),
  ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Chicago', 'IL', 'Dallas', 'TX', 'per_mile', 2.55, 0.60, 'reefer', '2025-01-01', '2026-06-30'),
  ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Los Angeles', 'CA', 'Phoenix', 'AZ', 'flat', 850.00, NULL, 'dry_van', '2025-01-01', '2026-06-30'),

  -- MidWest Freight rates
  ('c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Kansas City', 'MO', 'Chicago', 'IL', 'per_mile', 2.45, 0.55, 'dry_van', '2025-03-01', '2026-03-01'),
  ('c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Kansas City', 'MO', 'Denver', 'CO', 'per_mile', 2.60, 0.55, 'flatbed', '2025-03-01', '2026-03-01'),
  ('c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Omaha', 'NE', 'Dallas', 'TX', 'per_mile', 2.50, 0.60, 'dry_van', '2025-03-01', '2026-03-01'),

  -- Pacific Coast rates
  ('c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444', 'Los Angeles', 'CA', 'Seattle', 'WA', 'per_mile', 3.10, 0.70, 'reefer', '2025-06-01', '2026-01-01'),
  ('c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444', 'Los Angeles', 'CA', 'San Francisco', 'CA', 'flat', 1200.00, NULL, 'dry_van', '2025-06-01', '2026-01-01'),
  ('c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444', 'Portland', 'OR', 'Los Angeles', 'CA', 'per_mile', 2.95, 0.65, 'reefer', '2025-06-01', '2026-01-01'),

  -- Heartland rates
  ('c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'a5555555-5555-5555-5555-555555555555', 'Des Moines', 'IA', 'Chicago', 'IL', 'per_mile', 2.30, 0.50, 'dry_van', '2025-01-15', '2027-01-15'),
  ('c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'a5555555-5555-5555-5555-555555555555', 'Des Moines', 'IA', 'Minneapolis', 'MN', 'flat', 650.00, NULL, 'dry_van', '2025-01-15', '2027-01-15'),
  ('c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'a5555555-5555-5555-5555-555555555555', 'Omaha', 'NE', 'Kansas City', 'MO', 'per_mile', 2.20, 0.50, 'flatbed', '2025-01-15', '2027-01-15');

-- ============================================================
-- CONTRACT CONTACTS
-- ============================================================
INSERT INTO contract_contacts (company_id, contract_id, name, role, email, phone, is_primary) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Bob Martinez', 'dispatcher', 'bob@swiftbrokerage.com', '602-555-0101', TRUE),
  ('a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Sarah Kim', 'account_rep', 'sarah@swiftbrokerage.com', '602-555-0102', FALSE),
  ('a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'Linda Chen', 'dispatcher', 'linda@midwestfreight.com', '816-555-0201', TRUE),
  ('a4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333', 'James Reeves', 'account_rep', 'james@pacificcoast.com', '310-555-0401', TRUE),
  ('a5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 'Maria Gonzalez', 'dispatcher', 'maria@heartlandship.com', '515-555-0501', TRUE);
