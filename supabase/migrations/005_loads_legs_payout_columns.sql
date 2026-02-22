-- Add payout columns for contract total and per-leg payout-per-mile.

ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS contract_total_payout_cents BIGINT;

ALTER TABLE legs
  ADD COLUMN IF NOT EXISTS payout_per_mile_cents INTEGER;
