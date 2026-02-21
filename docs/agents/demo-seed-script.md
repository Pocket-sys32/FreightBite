# Agent Task: Demo Seed Script

## Goal
Create a script that seeds demo data for a full relay chain scenario.

## Context
The demo needs a Chicago -> LA load with multiple legs and pre-assigned
drivers to illustrate the relay concept. This script should be safe to run
in development multiple times.

## Requirements
- Create one load: Chicago -> LA.
- Create 4 legs with realistic mile splits and handoff points.
- Assign drivers to leg 1 and leg 2.
- Leave leg 3 and leg 4 open.
- Create at least 3 drivers with realistic HOS and home locations.
- Create at least 2 broker contacts for one driver.

## Script Details
- Place under `scripts/seed-demo.js`.
- Make it idempotent: delete existing demo load and recreate.
- Output a summary to stdout: loadId, legIds, driverIds.

## Acceptance Criteria
- Script can run with `node scripts/seed-demo.js`.
- No duplicate demo records are created if run twice.
- Data matches the required narrative for the demo.

## Testing
- Run the script, then hit `/api/loads/:id` to confirm data.
- Verify leg status and driver assignments in the DB.
