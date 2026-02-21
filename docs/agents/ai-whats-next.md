# Agent Task: AI "What's Next" Recommendation

## Goal
Implement an endpoint that recommends whether a driver should go home or stay
on the road after completing a leg.

## Context
This is a high-impact demo feature. It should return structured JSON that can
be used by the UI later, but for now it is backend-only.

## Endpoint
POST `/api/ai/whats-next`
Payload:
```
{
  "driverId": "...",
  "currentCity": "...",
  "homeCity": "...",
  "homeMilesAway": 420,
  "nearbyLoads": [ ... ]
}
```

## Behavior
- Fetch driver details (home location, HOS).
- Accept a list of nearby loads or derive them from DB.
- Call Claude with the prompt from `relay_haul_1day.md`.
- Return JSON with recommendation, topLoad, reasoning.

## Prompt Template
```
Truck driver just finished a leg. They're in ${currentCity}.
Home is ${homeMilesAway} miles away in ${homeCity}.
Available loads near them:
${JSON.stringify(nearbyLoads)}

Should they drive home (is there a load going that direction?) or
stay on the road (is there a high-paying load nearby)?
Return JSON: { recommendation: "HOME"|"STAY", topLoad: {...}, reasoning: "..." }
```

## Acceptance Criteria
- Response is valid JSON with keys: recommendation, topLoad, reasoning.
- recommendation is "HOME" or "STAY".
- Handles empty nearbyLoads gracefully.

## Testing
- Use mock nearby loads pointing toward home vs away.
- Validate JSON parsing does not fail.
