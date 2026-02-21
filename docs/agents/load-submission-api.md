# Agent Task: Load Submission API

## Goal
Implement the `/api/loads/submit` endpoint that accepts origin/destination,
calculates a route, segments it into relay legs, and persists the results.

## Context
This is the core backend feature. The system currently has no API routes beyond
the Socket.io demo. The route segmentation must mirror the spec in
`relay_haul_1day.md`.

## Inputs
POST `/api/loads/submit`
Payload example:
```
{
  "origin": { "lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL" },
  "destination": { "lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, CA" }
}
```

## Behavior
1. Call OSRM routing API:
   - `http://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&steps=true`
2. Compute total miles.
3. Compute number of legs: `ceil(totalMiles / 450)`.
4. Slice the route geometry into N legs.
5. Snap handoff points to a predefined truck-stop list.
6. Create a Load record and N Leg records.

## Truck Stops
Use the hardcoded list from `relay_haul_1day.md` and expand to ~20 stops.
Keep it in a module so other endpoints can re-use it.

## Output
Return JSON:
```
{
  "load": { ... },
  "legs": [ ... ]
}
```

## Implementation Notes
- Implement a `segmentLoad(origin, destination)` helper.
- Keep segmentation deterministic for a given route input.
- Legs should be ordered by `sequence` starting at 1.
- Each leg includes: origin, destination, miles, handoff_point, status.
- Status should default to "OPEN".

## Acceptance Criteria
- Calling `/api/loads/submit` creates 1 load + N legs in the DB.
- Result legs cover the full route and sum close to total miles.
- Returned payload includes DB IDs for load and legs.
- Errors from OSRM or DB are handled with 4xx/5xx responses.

## Testing
- Use a real Chicago -> LA route to validate leg count.
- Verify handoff points are assigned from the truck-stop list.
