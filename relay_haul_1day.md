# 🚛 RELAY HAUL — 1-Day Hackathon Sprint

> **The pitch:** DoorDash for solo truck drivers. AI dispatcher breaks loads into HOS-legal relay legs, matches drivers, and emails their existing contacts to fill gaps.

---

## ⏰ The Schedule (8am–11pm = 15 hours)

| Time | What You're Building |
|------|----------------------|
| 8:00–9:00am | Repo setup + DB schema |
| 9:00–11:00am | Backend API (load submission + relay segmentation) |
| 11:00am–1:00pm | AI dispatcher (Claude matching + email drafting) |
| 1:00–2:00pm | **Lunch + break** |
| 2:00–4:30pm | Driver-facing UI (accept leg, view handoff point) |
| 4:30–6:30pm | Shipper portal (submit load, watch relay chain map) |
| 6:30–8:00pm | Email OAuth + contact extraction |
| 8:00–9:30pm | "What's Next?" engine (drive home vs. stay on road) |
| 9:30–10:30pm | Polish demo data, fix bugs |
| 10:30–11:00pm | Record demo video, write README |

---

## 🏗️ Tech Stack (pick fast, no debates)

- **Backend:** Node.js + Express (or Fastify) — just use what you know
- **DB:** Supabase (Postgres + Realtime built in, free tier, 5-min setup)
- **Frontend:** Next.js — shipper portal AND driver web UI (skip native mobile today)
- **Maps:** Mapbox GL JS (free tier)
- **Routing:** OSRM public API (`router.project-osrm.org`) — don't self-host today
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`)
- **Email OAuth:** Gmail API (Google Cloud Console, 30 min setup)
- **Payments:** Skip entirely — show a "Pay Driver" button that logs to console
- **Auth:** Skip or use Clerk free tier with magic link only

---

## 📦 Data Models (keep it dead simple)

```sql
-- Loads
id, origin, destination, miles, status, created_at

-- Legs  
id, load_id, sequence, origin, destination, miles, 
handoff_point, rate_cents, status, driver_id

-- Drivers
id, name, email, current_lat, current_lng, 
hos_remaining_hours, home_lat, home_lng

-- Contacts (extracted from email)
id, driver_id, broker_name, broker_email, last_worked_together
```

---

## 🔧 Build Order

### Hour 1 — Foundation (8–9am)

```bash
npx create-next-app relay-haul --typescript
cd relay-haul
npm install @supabase/supabase-js @anthropic-ai/sdk mapbox-gl axios
```

- Create Supabase project, run the 4 table schemas above
- `.env.local` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `MAPBOX_TOKEN`
- Seed 10 fake drivers with lat/lngs spread across the US

---

### Hours 2–4 — Core Backend (9am–11am)

**`/api/loads/submit`** — takes origin + destination, calls OSRM, slices into legs

```javascript
// Segmentation logic (the whole core product)
async function segmentLoad(origin, destination) {
  const route = await fetch(
    `http://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&steps=true`
  ).then(r => r.json());

  const totalMiles = route.routes[0].distance * 0.000621371;
  const numLegs = Math.ceil(totalMiles / 450); // ~11hr drives at 50mph avg
  const milesPerLeg = totalMiles / numLegs;

  // Slice the route geometry into N equal legs
  // Snap each handoff point to a hardcoded list of major truck stops
  const TRUCK_STOPS = [
    { name: "Pilot - Joliet IL", lat: 41.52, lng: -88.08 },
    { name: "Flying J - Iowa City IA", lat: 41.66, lng: -91.53 },
    { name: "Love's - North Platte NE", lat: 41.12, lng: -100.76 },
    { name: "Pilot - Green River WY", lat: 41.52, lng: -109.46 },
    { name: "Flying J - Barstow CA", lat: 34.89, lng: -117.02 },
    // Add ~20 more for your demo corridors
  ];

  return buildLegs(route, numLegs, TRUCK_STOPS);
}
```

**`/api/legs/[id]/accept`** — driver accepts a leg, sets status = IN_TRANSIT

**`/api/legs/[id]/complete`** — handoff done, triggers next leg matching

---

### Hours 4–6 — AI Dispatcher (11am–1pm)

This is the money feature. Two Claude calls:

**1. Match explanation** (shown in shipper portal):
```javascript
const matchExplanation = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 150,
  messages: [{
    role: "user",
    content: `You are a freight dispatcher. Explain in 2 sentences why this driver 
is the best match for this leg. Be specific.

Leg: ${origin} → ${destination}, ${miles} miles, pickup at ${pickupTime}
Driver: ${driverName}, currently ${distanceFromPickup} miles away, 
${hosRemaining} hours HOS remaining, rating ${rating}/5`
  }]
});
```

**2. Email drafter** (driver reviews before sending):
```javascript
const emailDraft = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 200,
  messages: [{
    role: "user",
    content: `Draft a short email from truck driver ${driverName} to freight broker 
${brokerName} at ${brokerCompany}. Driver is currently in ${currentCity}, 
available tomorrow at 6am, has a ${trailerType}, wants loads going toward 
${preferredDirection}. They worked together before on ${lastLoadDetails}. 
Under 100 words. Skip the "hope this finds you well" crap.`
  }]
});
```

**3. What's Next? picker:**
```javascript
const recommendation = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 300,
  messages: [{
    role: "user",
    content: `Truck driver just finished a leg. They're in ${currentCity}.
Home is ${homeMilesAway} miles away in ${homeCity}.
Available loads near them:
${JSON.stringify(nearbyLoads)}

Should they drive home (is there a load going that direction?) or 
stay on the road (is there a high-paying load nearby)?
Return JSON: { recommendation: "HOME"|"STAY", topLoad: {...}, reasoning: "..." }`
  }]
});
```

---

### Hours 7–9.5 — UI (2–4:30pm)

Build just 3 pages:

**Page 1: `/driver`** — Driver dashboard
- List of open legs near them (pulled from DB, filtered by HOS)
- Each card: origin → destination, miles, pay, handoff truck stop
- Big green "Accept" button
- After accepting: shows turn-by-turn address + handoff point details

**Page 2: `/driver/next`** — What's Next? screen
- Two cards side by side: "Drive Home" vs "Stay On Road"
- Claude's recommendation highlighted
- Each card shows: load details, estimated pay, ETA home

**Page 3: `/driver/email`** — Email outreach
- List of extracted broker contacts
- For each: Claude-drafted email preview
- "Send" button (or "Copy to send manually" if OAuth is too slow)

---

### Hours 9.5–11.5 — Shipper Portal (4:30–6:30pm)

**Page: `/shipper`**

```
[Origin Input] --------→ [Destination Input]   [Submit Load]

[ Mapbox map showing route split into colored legs ]

Leg 1: Chicago → Iowa City    ✅ Marcus T. assigned   ETA 4pm
Leg 2: Iowa City → North Platte  🔄 Searching drivers...
Leg 3: North Platte → Barstow   ⏳ Waiting
Leg 4: Barstow → Los Angeles    ⏳ Waiting

AI says: "Marcus is 8 miles from pickup with 9.5 hours available.
He's hauled this corridor 12 times."
```

Use Supabase Realtime to update leg status without refresh:
```javascript
supabase
  .channel('legs')
  .on('postgres_changes', { event: 'UPDATE', table: 'legs' }, (payload) => {
    updateLegOnMap(payload.new);
  })
  .subscribe();
```

---

### Hours 11.5–13.5 — Email Integration (6:30–8pm)

**Option A (Full, if you're fast):** Gmail OAuth
1. Google Cloud Console → new project → enable Gmail API → OAuth credentials
2. Use `googleapis` npm package
3. Scan last 6 months of sent mail for keywords: "load", "tender", "rate", "pickup"
4. Extract To: addresses → save as contacts in DB

**Option B (Demo-safe fallback):** Skip OAuth, hardcode 3 fake contacts
```javascript
const DEMO_CONTACTS = [
  { name: "Bob Martinez", company: "Swift Brokerage", email: "bob@swift.com", 
    lastLoad: "3 reefer loads to Dallas, November" },
  { name: "Linda Chen", company: "MidWest Freight", email: "linda@mwf.com",
    lastLoad: "flatbed Chicago to KC, September" },
];
```
This still demos the AI email drafting feature — the interesting part — without burning 2 hours on OAuth.

---

### Hours 13.5–15 — Polish & Demo (8–11pm)

**Seed your demo data to tell this story:**

```javascript
// Chicago → LA load, all 4 legs visible
// Driver Marcus on leg 1 (assigned, in transit)
// Driver Sandra on leg 2 (assigned, not started)  
// Leg 3 open (shows "searching...")
// Leg 4 open — triggers email outreach to "Bob at Swift"
// Pre-seed Bob's "reply" email to show the full loop
```

**Demo script (60 seconds):**
1. Shipper submits Chicago → LA load → map animates 4 legs
2. Leg 1 & 2 auto-fill with drivers + AI explanation appears
3. Leg 4 has no match → AI drafts email to Bob → driver sends
4. "Bob" replies with a load → Leg 4 fills → chain complete
5. Marcus finishes his leg → What's Next? screen → AI recommends a load going toward his Denver home

**README must include:**
- What it does (2 sentences)
- How to run locally (3 commands)
- Link to live demo

---

## 🚨 If You're Running Behind

**Cut in this order:**
1. ~~Email OAuth~~ → use hardcoded demo contacts (save 1.5 hours)
2. ~~What's Next? screen~~ → just describe it in the pitch (save 1 hour)  
3. ~~Mapbox map~~ → show a table of legs instead (save 45 min)
4. ~~Shipper portal~~ → demo everything from the driver side only (save 1 hour)

**Never cut:** The Claude AI matching + email drafting. That's the whole idea.

---

## 💡 Judging Criteria Optimization

Most hackathons judge on: **demo wow factor > technical depth > market size**

Your wow moment is: *"The AI found a driver, filled a load, AND emailed a broker the driver already knows — all in under 30 seconds."* 

Make sure that sequence is tight, live, and unrehearsed-looking. The rest is set dressing.

---

## 🔑 ENV Variables You Need

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
GOOGLE_CLIENT_ID=          # optional, skip if behind
GOOGLE_CLIENT_SECRET=      # optional, skip if behind
```

---

**Go build it. You got this. 🚛💨**
