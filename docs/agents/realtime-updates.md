# Agent Task: Realtime Leg Updates

## Goal
Implement a backend broadcast mechanism for leg status changes.
This will support later UI updates without polling.

## Context
The repo already has Socket.io configured in `server.js`. We can reuse it
for backend-only realtime updates (no frontend build required right now).

## Implementation Options
Recommended (low effort):
- Emit Socket.io events when a leg status changes.

Alternative:
- If using Supabase Realtime, subscribe to DB updates and re-broadcast.

## Event Contract
Event name: `leg:update`
Payload:
```
{
  "legId": "...",
  "loadId": "...",
  "status": "OPEN" | "IN_TRANSIT" | "COMPLETE",
  "driverId": "...",
  "updatedAt": "..."
}
```

## Integration Points
- `/api/legs/:id/accept`
- `/api/legs/:id/complete`
- Any system matching process that assigns drivers

## Acceptance Criteria
- On accept/complete, a `leg:update` event is emitted.
- Payload includes enough data to refresh a UI later.
- Emission happens after DB commit succeeds.

## Testing
- Use the existing test client to listen for `leg:update` events.
- Verify event payload matches the contract.
