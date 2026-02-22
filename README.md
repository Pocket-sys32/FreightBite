# FreightBite

**AI-powered freight relay platform.** Break long-haul loads into HOS-legal relay legs, match drivers, and reduce empty miles so every leg earns—no backhaul left behind.

---

## What It Does

FreightBite turns a single long-haul load into a **relay chain**: multiple shorter legs that each fit within federal **Hours of Service (HOS)** limits (11-hour drive, 14-hour window, 70-hour/8-day cycle). Each leg hands off at real truck stops along the route. Drivers see only the legs they can legally run; shippers see the full chain and live status.

### Mitigating No Backhaul

- **Relay segmentation** — One load becomes several legs. Drivers take legs that fit their HOS and location instead of deadheading home or sitting empty.
- **“What’s Next?” engine** — After a leg, the app recommends **STAY** (another load nearby) or **HOME** (load toward home), using real distance-from-home and the best stay vs. home options so drivers can chain loads and avoid empty return trips.
- **AI outreach** — When a leg is unassigned, AI drafts emails to the driver’s broker contacts (backed by Supabase companies/contacts/rates) so gaps get filled faster and fewer loads run empty.
- **Open legs as “nearby loads”** — Drivers see available legs as opportunities; the system prioritizes rate and deadhead so they can choose backhauls and minimize empty miles.

Together, this reduces empty miles, improves asset use, and gives solo and small-fleet drivers a way to stay loaded more often—addressing both **no backhaul** and **underused capacity** in a declining driver-and-capacity market.

---

## Why This Matters for the Trucking Industry

- **Driver shortage and burnout** — HOS-compliant relay legs mean drivers don’t have to choose between violating limits and losing loads; they run legal segments and hand off.
- **Empty miles and razor-thin margins** — “What’s Next?” and nearby-load matching surface backhauls and next loads so drivers and fleets can string trips and cut deadhead.
- **Fragmented broker relationships** — AI outreach and contact-aware matching help drivers and dispatchers fill gaps using existing relationships instead of cold-calling.
- **Small carriers and owner-operators** — No need for a big dispatch desk; AI segmentation, matching, and email drafting bring relay and backhaul visibility to solo and small teams.

FreightBite is built to be an **effective solution** in that context: HOS-first design, real-time driver location and status, and AI that works with your existing network (contacts, loads, rates in Supabase) to keep freight moving and trucks earning.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express |
| **Database** | **Supabase** (Postgres); optional SQLite fallback for local dev |
| **Auth** | JWT (driver), optional Supabase Auth + Google OAuth |
| **AI** | OpenAI (e.g. `gpt-4o-mini`) — match explanation, email drafting, “What’s Next?”, outreach Q&A |
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Maps & routing** | Google Maps (Directions API), OSRM (route geometry), Mapbox optional |
| **UI** | Tailwind CSS 4, Radix UI, Lucide icons |
| **Realtime** | Socket.io (server); Supabase for document/contact data |

### Supabase

Supabase is the **primary data store** for production:

- **Postgres** — Loads, legs, drivers, contacts; schema in `supabase/schema.sql` and migrations in `supabase/migrations/`.
- **Service role + anon** — Server uses service role for admin/extraction jobs; UI uses anon key (and optional Supabase Auth).
- **Optional RLS** — Schema supports Row Level Security for multi-tenant or per-driver data.
- **Documents & context** — Uploaded contracts/rate sheets/invoices stored in Supabase; AI outreach and DispAIch use `lib/ai/supabase-context.js` to pull companies, contacts, and rates for grounded answers.

If Supabase env vars are missing, the server still starts and falls back to **SQLite** (`server/db`), so you can run and develop without a Supabase project.

---

## Technical Depth (Highlights)

- **Load segmentation** (`server/segmentLoad.js`) — Geocodes origin/destination, fetches route geometry (Google Directions or OSRM), splits the route into legs at ~450 mi (HOS-friendly length), snaps handoff points to real truck stops, reverse-geocodes addresses. Produces a full relay chain with miles, handoff locations, and status.
- **Leg lifecycle** — Accept → Start route → Pause/Resume → Arrive → Handoff/Complete. Workflow and events drive driver UI state and HOS usage (shift/cycle hours) derived from event timestamps.
- **HOS usage** — Computed from leg events (drive vs. off); 11h/14h/70h-8day rules reflected in `ui` and `mobile-app` (e.g. `lib/hos.ts`).
- **“What’s Next?” API** (`lib/ai/whats-next.js`) — Takes driver, distance-from-home, and the exact STAY and HOME options shown in the UI; returns recommendation and reasoning so the explanation matches what the driver sees.
- **Outreach** — Document upload (PDF) to Supabase storage; extraction and AI chat use Supabase companies/contacts/contracts/rates for context-aware suggestions and “who to contact first.”
- **Driver location** — `PATCH /api/drivers/me/location` and optional live updates for map and “nearby loads” ranking.

---

## How to Run

### Prerequisites

- Node.js 18+
- (Optional) Supabase project for Postgres and storage
- (Optional) OpenAI API key for AI features
- (Optional) Google Maps API key for geocoding/directions and relay map

### 1. Clone and install

git clone <repo-url>
cd FreightBite
npm install
npm --prefix ui install


### 2. Run Backend + UI


# terminal 1
npm start

# terminal 2
npm run ui:dev

Backend runs on http://localhost:3000. UI runs on http://localhost:3001.

