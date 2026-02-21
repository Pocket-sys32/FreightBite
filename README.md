# FreightBite

## Data Layer

This project uses Supabase Postgres as the primary store. If Supabase env vars
are not set, the server falls back to a local SQLite database.

### Environment

Copy `.env.example` and set the values:

```bash
cp .env.example .env
```

Required for Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

SQLite fallback:

- `SQLITE_PATH` (defaults to `./data/freightbite.db`)

### Schema

Postgres schema: `server/db/schema.sql`

SQLite schema is initialized automatically on startup by `server/db/index.js`.

### Seed Data

Postgres seed SQL: `server/db/seed.sql`

SQLite seed SQL: `server/db/seed.sqlite.sql`

## UI Workspace

The unzipped relay-haul UI has been integrated as a standalone Next.js app in:

- `ui/`

The UI is now wired to the backend API (`/api/*`) via a Next.js rewrite proxy.

### Run Backend + UI

```bash
npm install
npm --prefix ui install

# terminal 1
npm start

# terminal 2
npm run ui:dev
```

Backend runs on `http://localhost:3000`. UI runs on `http://localhost:3001`.

### Notes

- On first backend start without Supabase, SQLite is used and a demo driver/contact are auto-seeded.
- AI endpoints require `ANTHROPIC_API_KEY`. Without it, UI falls back gracefully on recommendation/draft generation.
- Shipper submission accepts known city labels (e.g. `Chicago, IL`, `Los Angeles, CA`, `Melrose Park, IL`, `Rialto, CA`) or `lat,lng`.
