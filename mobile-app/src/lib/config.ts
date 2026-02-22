export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN || '').replace(/\/+$/, '');
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
export const HANDOFF_COMPLETION_RADIUS_MILES = Number(
  process.env.EXPO_PUBLIC_HANDOFF_COMPLETION_RADIUS_MILES || 0.25
);
