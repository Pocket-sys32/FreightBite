-- FreightBite AI Dispatcher: Contracts & Rate Sheets Database
-- Migration 001: Core document/contract schema

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DOCUMENTS: Raw uploaded files (PDFs, scans, emails)
-- ============================================================
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename      TEXT NOT NULL,
  file_url      TEXT,                          -- Supabase Storage URL
  file_type     TEXT,                          -- pdf, xlsx, csv, image
  document_type TEXT NOT NULL CHECK (document_type IN (
    'rate_sheet', 'contract', 'bol', 'invoice', 'other'
  )),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'extracted', 'failed'
  )),
  extraction_error TEXT,                       -- error message if extraction failed
  raw_text      TEXT,                          -- full extracted text from OCR/parse
  metadata      JSONB DEFAULT '{}',            -- flexible extra fields
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPANIES: Carriers, brokers, shippers
-- ============================================================
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  mc_number     TEXT,                          -- Motor Carrier number
  dot_number    TEXT,                          -- DOT number
  company_type  TEXT NOT NULL CHECK (company_type IN (
    'carrier', 'broker', 'shipper', 'other'
  )),
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  phone         TEXT,
  email         TEXT,
  website       TEXT,
  notes         TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_companies_mc ON companies(mc_number) WHERE mc_number IS NOT NULL;
CREATE UNIQUE INDEX idx_companies_dot ON companies(dot_number) WHERE dot_number IS NOT NULL;

-- ============================================================
-- CONTRACTS: Agreements between parties
-- ============================================================
CREATE TABLE contracts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_type   TEXT NOT NULL CHECK (contract_type IN (
    'carrier_agreement', 'broker_carrier', 'rate_confirmation', 'master_agreement', 'other'
  )),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'expired', 'pending', 'terminated'
  )),
  effective_date  DATE,
  expiration_date DATE,
  payment_terms   TEXT,                        -- e.g. "Net 30", "Quick Pay 2%"
  insurance_min   INTEGER,                     -- minimum insurance in dollars
  equipment_types TEXT[],                      -- e.g. {'dry_van', 'reefer', 'flatbed'}
  notes           TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contracts_company ON contracts(company_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_expiration ON contracts(expiration_date);

-- ============================================================
-- RATES: Lane-specific pricing from rate sheets/contracts
-- ============================================================
CREATE TABLE rates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id       UUID REFERENCES contracts(id) ON DELETE CASCADE,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Lane definition
  origin_city       TEXT NOT NULL,
  origin_state      TEXT NOT NULL,
  destination_city  TEXT NOT NULL,
  destination_state TEXT NOT NULL,

  -- Pricing
  rate_type         TEXT NOT NULL CHECK (rate_type IN (
    'per_mile', 'flat', 'per_hundredweight', 'other'
  )),
  rate_amount       NUMERIC(10, 2) NOT NULL,   -- dollar amount
  fuel_surcharge    NUMERIC(5, 2),             -- percentage or flat
  accessorial_fees  JSONB DEFAULT '{}',        -- detention, layover, etc.

  -- Load specs
  equipment_type    TEXT,                       -- dry_van, reefer, flatbed, etc.
  min_weight        INTEGER,                   -- pounds
  max_weight        INTEGER,                   -- pounds
  temperature_min   NUMERIC(5, 1),             -- for reefer loads
  temperature_max   NUMERIC(5, 1),

  -- Validity
  effective_date    DATE,
  expiration_date   DATE,

  notes             TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rates_lane ON rates(origin_state, destination_state);
CREATE INDEX idx_rates_company ON rates(company_id);
CREATE INDEX idx_rates_equipment ON rates(equipment_type);
CREATE INDEX idx_rates_expiration ON rates(expiration_date);

-- ============================================================
-- CONTRACT_CONTACTS: People associated with contracts
-- ============================================================
CREATE TABLE contract_contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id   UUID REFERENCES contracts(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  role          TEXT,                          -- dispatcher, account_rep, billing, etc.
  email         TEXT,
  phone         TEXT,
  is_primary    BOOLEAN DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_company ON contract_contacts(company_id);

-- ============================================================
-- UPDATED_AT TRIGGER: Auto-update timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rates_updated_at
  BEFORE UPDATE ON rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contract_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (enable, but leave policies open for now)
-- ============================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_contacts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (tighten later)
CREATE POLICY "Allow all for authenticated" ON documents
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated" ON companies
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated" ON contracts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated" ON rates
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated" ON contract_contacts
  FOR ALL USING (auth.role() = 'authenticated');

-- Also allow service_role full access (for server-side extraction)
CREATE POLICY "Allow all for service_role" ON documents
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service_role" ON companies
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service_role" ON contracts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service_role" ON rates
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service_role" ON contract_contacts
  FOR ALL USING (auth.role() = 'service_role');
