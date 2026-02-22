# Scanned PDF → Supabase extraction

Extracts structured data from **scanned** (image-only) PDFs using OCR and upserts to your Supabase `documents`, `companies`, and `rates` tables. Links each document to a Supabase Auth user via `metadata.user_id` (or add `user_id` column; see below).

## Parsed fields

| Category | Fields |
|----------|--------|
| **Dates** | Pickup Date, Delivery Date, Invoice Date |
| **Locations** | Origin City/State/Zip, Destination City/State/Zip |
| **Financials** | Total Rate, Line Haul, Accessorials (Detention, Lumper), Factoring Fees; **Rate per mile** (miles from origin→dest via OSRM, then total rate ÷ miles) |
| **Load specs** | Commodity, Weight, Equipment Type |
| **Entities** | Broker Name, Truck # |

## Setup

1. **Tesseract OCR** (required for scanned PDFs):

   ```bash
   # Ubuntu/Debian
   sudo apt install tesseract-ocr
   # macOS
   brew install tesseract
   ```

2. **Python venv and deps** (avoids system “externally-managed-environment”):

   On Ubuntu/Debian, install the venv package once if needed:

   ```bash
   sudo apt install python3.12-venv   # or python3-venv
   ```

   Then create the venv and install:

   ```bash
   cd scripts/pdf_extract
   python3 -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

   Run the script with the venv active, or call it explicitly:

   ```bash
   scripts/pdf_extract/venv/bin/python scripts/pdf_extract/extract_invoice.py ...
   ```

3. **Env** (e.g. `.env.local` in repo root):

   - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` (service role preferred for server/scripts)
   - Optional: `OPENAI_API_KEY` and `EXTRACT_USE_LLM=1` for LLM-assisted parsing
   - Optional: `SUPABASE_USER_ID` (default `--user-id` for linking to auth)

## Usage

From repo root (with venv active, or use `scripts/pdf_extract/venv/bin/python`):

```bash
# Single PDF, link to auth user
python scripts/pdf_extract/extract_invoice.py path/to/invoice.pdf --user-id "<supabase-auth-uid>"

# Directory of PDFs
python scripts/pdf_extract/extract_invoice.py path/to/pdfs/ --user-id "<uid>"

# Use OpenAI to improve extraction from messy OCR
EXTRACT_USE_LLM=1 python scripts/pdf_extract/extract_invoice.py invoice.pdf --user-id "<uid>"
```

- **user-id**: Supabase Auth user UUID. Stored in `documents.metadata->user_id`. If you add a `user_id` column to `documents`, update the script to set it and use RLS: `USING (auth.uid() = user_id)`.

## Supabase

- **documents**: One row per PDF; `raw_text` = full OCR, `metadata.extracted` = parsed payload, `metadata.user_id` = auth user.
- **companies**: Broker (and carrier) upserted by name when present.
- **rates**: One row per document when origin/destination and rate are present; linked to `document_id` and `company_id`.

## Linking to Supabase Auth

Documents are linked to an account by passing `--user-id <auth-user-uuid>`. The script stores it in `documents.metadata.user_id`. To enforce per-user access in Supabase:

1. Add a column: `ALTER TABLE documents ADD COLUMN user_id UUID REFERENCES auth.users(id);`
2. In the script, set `user_id` on insert (and keep or drop `metadata.user_id`).
3. Add RLS: `CREATE POLICY "Users see own documents" ON documents FOR ALL USING (auth.uid() = user_id);`

Until then, filter in your app by `metadata->>'user_id' = auth.uid()::text`.
