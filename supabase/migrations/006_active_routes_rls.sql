-- Active routes: enable RLS and add policies so API pages can read/write
-- loads, legs, drivers, handoffs, leg_events, accounts, contacts.
-- Use with anon key or service_role key from the backend.

-- ============================================================
-- RELAY TABLES: enable RLS and allow anon + service_role
-- ============================================================

ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leg_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- loads
CREATE POLICY "Allow all for anon" ON loads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON loads FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON loads FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- legs
CREATE POLICY "Allow all for anon" ON legs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON legs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON legs FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- drivers
CREATE POLICY "Allow all for anon" ON drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON drivers FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON drivers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- handoffs
CREATE POLICY "Allow all for anon" ON handoffs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON handoffs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON handoffs FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- leg_events
CREATE POLICY "Allow all for anon" ON leg_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON leg_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON leg_events FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- accounts
CREATE POLICY "Allow all for anon" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON accounts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON accounts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- contacts
CREATE POLICY "Allow all for anon" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service_role" ON contacts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON contacts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (true);

-- ============================================================
-- OWNER-SCOPED TABLES: allow anon so backend works with anon key
-- (001 already allows authenticated + service_role)
-- ============================================================

CREATE POLICY "Allow all for anon" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON contract_contacts FOR ALL USING (true) WITH CHECK (true);
