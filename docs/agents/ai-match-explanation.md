# Agent Task: AI Match Explanation

## Goal
Add an endpoint that uses Claude to explain why a driver was matched to a leg.
The output is stored and can be shown in the shipper portal.

## Context
This is one of the main "wow" moments. The endpoint should be callable on
assignment or on demand.

## Endpoint
POST `/api/ai/match-explanation`
Payload:
```
{
  "legId": "...",
  "driverId": "..."
}
```

## Behavior
- Load leg + driver details from DB.
- Compose the prompt from `relay_haul_1day.md` (2 sentences, specific).
- Call Claude (`claude-sonnet-4-6`).
- Store the explanation on the leg record (e.g. `match_explanation`).
- Return `{ explanation }`.

## Prompt Template
```
You are a freight dispatcher. Explain in 2 sentences why this driver
is the best match for this leg. Be specific.

Leg: ${origin} -> ${destination}, ${miles} miles, pickup at ${pickupTime}
Driver: ${driverName}, currently ${distanceFromPickup} miles away,
${hosRemaining} hours HOS remaining, rating ${rating}/5
```

## Acceptance Criteria
- Explanation is stored on the leg.
- Response is under 2 sentences.
- Claude errors return 502 with a clear message.

## Testing
- Verify prompt values are real (not undefined).
- Ensure repeated calls overwrite or update consistently.
