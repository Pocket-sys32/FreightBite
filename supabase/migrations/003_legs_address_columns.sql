-- Add street address columns to legs table
ALTER TABLE legs ADD COLUMN IF NOT EXISTS origin_address text;
ALTER TABLE legs ADD COLUMN IF NOT EXISTS destination_address text;
