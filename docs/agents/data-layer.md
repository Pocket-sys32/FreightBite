# Agent Task: Data Layer and Schema

## Goal
Define and implement the backend data layer for the FreightBite relay-haul system.
This includes the database schema, initialization, and a thin access layer that
the API routes can use consistently.

## Context
The repo currently contains a minimal Express + Socket.io server
(`server.js`) and no persistence. The relay-haul product needs Loads, Legs,
Drivers, and Contacts to exist as first-class records.

## Recommended Approach
- Use Supabase Postgres as the primary store (aligned with `relay_haul_1day.md`).
- Add a database module that exposes CRUD helpers for loads, legs, drivers,
  and contacts.

If Supabase is unavailable, implement the same interfaces using a local
SQLite DB, but keep the method signatures identical so later switching is easy.

## Required Tables

1. Loads
   - id (uuid or serial)
   - origin (text)
   - destination (text)
   - miles (numeric)
   - status (text)
   - created_at (timestamp)

2. Legs
   - id (uuid or serial)
   - load_id (fk loads.id)
   - sequence (int)
   - origin (text)
   - destination (text)
   - miles (numeric)
   - handoff_point (text)
   - rate_cents (int)
   - status (text)
   - driver_id (fk drivers.id, nullable)

3. Drivers
   - id (uuid or serial)
   - name (text)
   - email (text)
   - current_lat (numeric)
   - current_lng (numeric)
   - hos_remaining_hours (numeric)
   - home_lat (numeric)
   - home_lng (numeric)

4. Contacts
   - id (uuid or serial)
   - driver_id (fk drivers.id)
   - broker_name (text)
   - broker_email (text)
   - last_worked_together (text)

## Data Access Layer
Create a module (e.g. `server/db.js` or `server/db/index.js`) with functions:

- createLoad(load)
- createLegs(legs[])
- getLoadById(id)
- getLegById(id)
- updateLegStatus(id, status, driverId?)
- listOpenLegsNear(lat, lng, hosHours)
- listContactsByDriver(driverId)

These should be small wrappers over Supabase queries or SQL.

## Acceptance Criteria
- Schema matches fields above and is documented for other agents.
- A single DB module exists and is used by all APIs.
- Local environment variables are documented in README or `.env.example`.
- Basic seed data can be inserted without errors.

## Notes
- Keep field names stable; other agent tasks depend on them.
- Use simple enums for status: "OPEN", "IN_TRANSIT", "COMPLETE".
- Ensure default timestamps are set by the DB.

## Handoff to Other Agents
Provide the final schema SQL and the JS data-access module interface.
