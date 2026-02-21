# Agent Task: Leg Lifecycle APIs

## Goal
Implement endpoints that allow a driver to accept and complete a leg.
These endpoints update leg state and trigger downstream behaviors.

## Context
Legs start as "OPEN". A driver accepts a leg ("IN_TRANSIT") and later
completes it ("COMPLETE"). This is the system's status backbone.

## Endpoints

1. POST `/api/legs/:id/accept`
Payload:
```
{ "driverId": "..." }
```
Behavior:
- Validate leg exists and is OPEN.
- Set `status = "IN_TRANSIT"`, `driver_id = driverId`.
- Return updated leg.

2. POST `/api/legs/:id/complete`
Payload:
```
{ "driverId": "..." }
```
Behavior:
- Validate leg exists and belongs to driver.
- Set `status = "COMPLETE"`.
- Return updated leg.

## Side Effects
- When a leg is completed, emit an event for downstream processes:
  - match next leg
  - trigger "What's Next" recommendation
  - broadcast realtime update
Use a simple event emitter or call hooks directly.

## Acceptance Criteria
- Status changes persist correctly.
- Invalid transitions return 409 or 400.
- Updated leg is returned to client.
- Emits a follow-up signal or calls a hook after completion.

## Testing
- Accepting already accepted leg returns conflict.
- Completing leg without ownership returns 403.
