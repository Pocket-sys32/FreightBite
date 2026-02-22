-- Link documents to Supabase Auth users (for pdf_extract and app filtering)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- Optional: RLS so users only see their own documents (if you use auth)
-- DROP POLICY IF EXISTS "Allow all for authenticated" ON documents;
-- CREATE POLICY "Users see own documents" ON documents
--   FOR ALL USING (auth.uid() = user_id);

COMMENT ON COLUMN documents.user_id IS 'Supabase Auth user who owns this document (for linking scanned PDFs to account).';
