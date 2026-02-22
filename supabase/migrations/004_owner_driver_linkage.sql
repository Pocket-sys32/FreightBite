-- Link extracted outreach artifacts to an application driver UUID.
-- This keeps companies/contracts/rates/contacts scoped to the driver account
-- that uploaded the source file from the outreach page.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS owner_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS owner_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS owner_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE rates
  ADD COLUMN IF NOT EXISTS owner_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE contract_contacts
  ADD COLUMN IF NOT EXISTS owner_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_owner_driver_id ON documents(owner_driver_id);
CREATE INDEX IF NOT EXISTS idx_companies_owner_driver_id ON companies(owner_driver_id);
CREATE INDEX IF NOT EXISTS idx_contracts_owner_driver_id ON contracts(owner_driver_id);
CREATE INDEX IF NOT EXISTS idx_rates_owner_driver_id ON rates(owner_driver_id);
CREATE INDEX IF NOT EXISTS idx_contract_contacts_owner_driver_id ON contract_contacts(owner_driver_id);
