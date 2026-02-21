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
