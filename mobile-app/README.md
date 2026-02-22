# FreightBite Mobile (React Native)

This folder contains a mobile React Native app (Expo) that uses the same FreightBite backend APIs.

## Features ported from web
- Driver authentication against existing backend token flow
- Live GPS tracking (`PATCH /api/drivers/me/location`)
- Driver board with:
  - open legs
  - claimed legs
  - leg workflow actions (`accept`, `start-route`, `arrive`, `handoff`, `pause-route`, `resume-route`)
- HOS usage computed from leg events (driving-only accumulation)
- In-app route page with Google Directions:
  - current location -> pickup/transfer
  - pickup/transfer -> drop
  - color-coded segments
- Outreach screen:
  - AI draft email
  - PDF upload + scrape (`POST /api/outreach/extract-upload`)
  - links extracted records to driver UUID

## Setup
1. Install dependencies:
   ```bash
   cd mobile-app
   npm install
   ```
2. Copy env file:
   ```bash
   cp .env.example .env
   ```
3. Set values in `.env`:
   - `EXPO_PUBLIC_API_ORIGIN` -> your backend URL
   - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` -> Google Maps key
4. Run app:
   ```bash
   npm run start
   ```

## Notes
- Backend must be running and reachable from your mobile device.
- For real-device testing, use your machine LAN IP for `EXPO_PUBLIC_API_ORIGIN` (not `localhost`).
