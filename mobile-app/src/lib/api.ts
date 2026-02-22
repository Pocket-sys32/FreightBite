import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from './config';
import type {
  BrokerContact,
  DraftEmail,
  Driver,
  HandoffLink,
  Leg,
  LegEvent,
  LegWorkflow,
  OutreachUploadResult,
} from './types';

const AUTH_TOKEN_KEY = 'freightbite_driver_token';

type RawPoint =
  | string
  | {
      lat?: number;
      lng?: number;
      label?: string;
      name?: string;
    }
  | null
  | undefined;

interface RawDriver {
  id: string;
  name: string;
  email: string;
  current_lat?: number | null;
  current_lng?: number | null;
  hos_remaining_hours?: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
}

interface RawLeg {
  id: string;
  load_id: string;
  sequence: number;
  origin: RawPoint;
  destination: RawPoint;
  miles?: number;
  handoff_point?: RawPoint;
  rate_cents?: number;
  status?: string;
  driver_id?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
}

interface RawContact {
  id: string;
  broker_name?: string | null;
  broker_email?: string | null;
  last_worked_together?: string | null;
}

interface RawLegEvent {
  id: string;
  leg_id: string;
  driver_id?: string | null;
  event_type: string;
  payload?: unknown;
  created_at?: string;
}

interface RawHandoff {
  id: string;
  from_leg_id: string;
  to_leg_id: string;
  from_driver_id?: string | null;
  to_driver_id?: string | null;
  status: 'PENDING' | 'READY' | 'COMPLETE';
  updated_at?: string;
}

interface RawLegWorkflow {
  phase: string;
  latestEvent: RawLegEvent | null;
  events: RawLegEvent[];
  previousLeg: RawLeg | null;
  nextLeg: RawLeg | null;
  handoffs: RawHandoff[];
}

const TRAILER_TYPES: Driver['trailerType'][] = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck'];
const TRAILER_LENGTHS: Driver['trailerLength'][] = ['53ft', '48ft'];
const ELD_PROVIDERS = ['Samsara', 'Motive', 'Geotab', 'KeepTruckin'];

const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number; label: string }> = {
  'chicago, il': { lat: 41.8781, lng: -87.6298, label: 'Chicago, IL' },
  'denver, co': { lat: 39.7392, lng: -104.9903, label: 'Denver, CO' },
  'los angeles, ca': { lat: 34.0522, lng: -118.2437, label: 'Los Angeles, CA' },
  'cedar city, ut': { lat: 37.6775, lng: -113.0619, label: 'Cedar City, UT' },
};

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pointLabel(point: RawPoint, fallback: string): string {
  if (!point) return fallback;
  if (typeof point === 'string') return point;
  if (typeof point.label === 'string' && point.label.trim()) return point.label;
  if (typeof point.name === 'string' && point.name.trim()) return point.name;
  if (typeof point.lat === 'number' && typeof point.lng === 'number') {
    return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
  }
  return fallback;
}

function pointCoords(point: RawPoint): { lat?: number; lng?: number } {
  if (point && typeof point === 'object') {
    return { lat: point.lat, lng: point.lng };
  }
  return {};
}

function stateFromLabel(label: string): string {
  const match = label.match(/,\s*([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : '--';
}

function nearestKnownLabel(lat?: number | null, lng?: number | null, fallback = 'On Route'): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return fallback;

  let best = fallback;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const item of Object.values(KNOWN_LOCATIONS)) {
    const score = Math.pow(item.lat - lat, 2) + Math.pow(item.lng - lng, 2);
    if (score < bestScore) {
      bestScore = score;
      best = item.label;
    }
  }

  return best;
}

function statusToUi(rawStatus: string | undefined, driverId: string | null | undefined): Leg['status'] {
  const status = (rawStatus || '').toUpperCase();
  if (status === 'IN_TRANSIT') return 'IN_TRANSIT';
  if (status === 'COMPLETE' || status === 'COMPLETED') return 'COMPLETED';
  if (status === 'OPEN' && driverId) return 'ASSIGNED';
  if (status === 'OPEN') return 'OPEN';
  return 'OPEN';
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers ? (init.headers as Record<string, string>) : {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${API_ORIGIN}${normalizedPath}`;

  if (!API_ORIGIN && !url.startsWith('http')) {
    throw new Error('EXPO_PUBLIC_API_ORIGIN is required in mobile-app environment.');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: string; details?: string };
      throw new Error(parsed.details ? `${parsed.error || text} (${parsed.details})` : parsed.error || text);
    } catch {
      throw new Error(text || `Request failed (${response.status})`);
    }
  }

  return response.json() as Promise<T>;
}

function mapDriver(raw: RawDriver): Driver {
  const hash = stableHash(raw.id);
  const currentCity = nearestKnownLabel(raw.current_lat ?? null, raw.current_lng ?? null, 'On Route');
  const homeCity = nearestKnownLabel(raw.home_lat ?? null, raw.home_lng ?? null, 'Home Base');
  const hosRemainingHours = Number(Math.max(0, Math.min(11, toNumber(raw.hos_remaining_hours, 11))).toFixed(1));
  const fallbackLat = typeof raw.home_lat === 'number' ? raw.home_lat : 39.5;
  const fallbackLng = typeof raw.home_lng === 'number' ? raw.home_lng : -98.35;

  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    mcNumber: `MC-${String(hash).slice(0, 7)}`,
    dotNumber: `${1000000 + (hash % 9000000)}`,
    currentLat: toNumber(raw.current_lat, fallbackLat),
    currentLng: toNumber(raw.current_lng, fallbackLng),
    hosRemainingHours,
    hosCycleUsed: 0,
    homeLat: toNumber(raw.home_lat, fallbackLat),
    homeLng: toNumber(raw.home_lng, fallbackLng),
    homeCity,
    currentCity,
    rating: Number((4.2 + (hash % 8) * 0.1).toFixed(1)),
    totalLoads: 200 + (hash % 1200),
    trailerType: TRAILER_TYPES[hash % TRAILER_TYPES.length],
    trailerLength: TRAILER_LENGTHS[hash % TRAILER_LENGTHS.length],
    eldProvider: ELD_PROVIDERS[hash % ELD_PROVIDERS.length],
  };
}

function mapLeg(raw: RawLeg, names: Map<string, string>): Leg {
  const miles = Number(toNumber(raw.miles, 0).toFixed(1));
  const rateCents = typeof raw.rate_cents === 'number' && raw.rate_cents > 0 ? raw.rate_cents : Math.round(miles * 185);
  const fuelSurchargeCents = Math.round(miles * 32);
  const ratePerMile = miles > 0 ? Number((rateCents / miles / 100).toFixed(2)) : 0;
  const origin = pointLabel(raw.origin, 'Origin');
  const destination = pointLabel(raw.destination, 'Destination');
  const originCoords = pointCoords(raw.origin);
  const destinationCoords = pointCoords(raw.destination);
  const handoffPoint = pointLabel(raw.handoff_point, 'Handoff Point');
  const handoffCoords = pointCoords(raw.handoff_point);
  const handoffAddress = typeof handoffCoords.lat === 'number' && typeof handoffCoords.lng === 'number'
    ? `${handoffCoords.lat.toFixed(4)}, ${handoffCoords.lng.toFixed(4)}`
    : handoffPoint;
  const sequence = toNumber(raw.sequence, 1);
  const pickupDate = new Date(Date.now() + sequence * 2 * 60 * 60 * 1000);
  const deliveryDate = new Date(pickupDate.getTime() + Math.max(2, miles / 55) * 60 * 60 * 1000);
  const driverId = raw.driver_id || null;

  return {
    id: raw.id,
    loadId: raw.load_id,
    sequence,
    origin,
    originState: stateFromLabel(origin),
    originAddress: raw.origin_address || origin,
    originLat: originCoords.lat,
    originLng: originCoords.lng,
    destination,
    destinationState: stateFromLabel(destination),
    destinationAddress: raw.destination_address || destination,
    destinationLat: destinationCoords.lat,
    destinationLng: destinationCoords.lng,
    miles,
    deadheadMiles: 0,
    handoffPoint,
    handoffAddress,
    rateCents,
    ratePerMile,
    fuelSurchargeCents,
    status: statusToUi(raw.status, driverId),
    driverId,
    driverName: driverId ? names.get(driverId) || null : null,
    estimatedPickup: formatDate(pickupDate),
    estimatedDelivery: formatDate(deliveryDate),
    commodity: 'General Freight',
    weight: 38000,
  };
}

function mapEvent(raw: RawLegEvent): LegEvent {
  return {
    id: raw.id,
    legId: raw.leg_id,
    driverId: raw.driver_id || null,
    eventType: raw.event_type,
    payload: raw.payload ?? null,
    createdAt: raw.created_at || null,
  };
}

function mapHandoff(raw: RawHandoff): HandoffLink {
  return {
    id: raw.id,
    fromLegId: raw.from_leg_id,
    toLegId: raw.to_leg_id,
    fromDriverId: raw.from_driver_id || null,
    toDriverId: raw.to_driver_id || null,
    status: raw.status,
    updatedAt: raw.updated_at || null,
  };
}

function mapWorkflow(raw: RawLegWorkflow | null | undefined, names: Map<string, string>): LegWorkflow {
  return {
    phase: raw?.phase || 'OPEN',
    latestEvent: raw?.latestEvent ? mapEvent(raw.latestEvent) : null,
    events: (raw?.events || []).map(mapEvent),
    previousLeg: raw?.previousLeg ? mapLeg(raw.previousLeg, names) : null,
    nextLeg: raw?.nextLeg ? mapLeg(raw.nextLeg, names) : null,
    handoffs: (raw?.handoffs || []).map(mapHandoff),
  };
}

async function fetchDriverNames(): Promise<Map<string, string>> {
  const rawDrivers = await apiFetch<RawDriver[]>('/api/drivers');
  const map = new Map<string, string>();
  for (const driver of rawDrivers || []) {
    map.set(driver.id, driver.name);
  }
  return map;
}

export async function saveAuthToken(token: string) {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function getAuthToken() {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function clearAuthToken() {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function loginDriverAccount(email: string, password: string): Promise<Driver> {
  const response = await apiFetch<{ token: string; driver: RawDriver }>('/api/auth/login-driver', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await saveAuthToken(response.token);
  return mapDriver(response.driver);
}

export async function fetchCurrentDriver(): Promise<Driver | null> {
  try {
    const response = await apiFetch<{ driver: RawDriver }>('/api/auth/me');
    return mapDriver(response.driver);
  } catch {
    return null;
  }
}

export async function updateDriverLiveLocation(input: { lat: number; lng: number; accuracy?: number }): Promise<Driver> {
  const response = await apiFetch<{ driver: RawDriver }>('/api/drivers/me/location', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return mapDriver(response.driver);
}

export async function fetchLegs(options?: { status?: string; driverId?: string; loadId?: string }): Promise<Leg[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.driverId) params.set('driverId', options.driverId);
  if (options?.loadId) params.set('loadId', options.loadId);
  const query = params.toString();
  const names = await fetchDriverNames();
  const raw = await apiFetch<RawLeg[]>(`/api/legs${query ? `?${query}` : ''}`);
  return (raw || []).map((item) => mapLeg(item, names));
}

export async function fetchLegWorkflow(legId: string): Promise<LegWorkflow> {
  const response = await apiFetch<{ workflow: RawLegWorkflow }>(`/api/legs/${legId}/workflow`);
  const names = await fetchDriverNames();
  return mapWorkflow(response.workflow, names);
}

async function mutateLegRoute(path: string): Promise<void> {
  await apiFetch(path, { method: 'POST', body: JSON.stringify({}) });
}

export async function acceptLeg(legId: string) {
  await mutateLegRoute(`/api/legs/${legId}/accept`);
}

export async function startLegRoute(legId: string) {
  await mutateLegRoute(`/api/legs/${legId}/start-route`);
}

export async function pauseLegRoute(legId: string) {
  await mutateLegRoute(`/api/legs/${legId}/pause-route`);
}

export async function resumeLegRoute(legId: string) {
  await mutateLegRoute(`/api/legs/${legId}/resume-route`);
}

export async function arriveAtLegStop(legId: string) {
  await mutateLegRoute(`/api/legs/${legId}/arrive`);
}

export async function finishLegHandoff(legId: string, location?: { lat?: number; lng?: number; accuracy?: number }) {
  await apiFetch(`/api/legs/${legId}/handoff`, {
    method: 'POST',
    body: JSON.stringify({
      currentLat: location?.lat,
      currentLng: location?.lng,
      accuracy: location?.accuracy,
    }),
  });
}

export async function fetchDriverContacts(driverId: string): Promise<BrokerContact[]> {
  const raw = await apiFetch<RawContact[]>(`/api/drivers/${driverId}/contacts`);
  return (raw || []).map((contact, index) => ({
    id: contact.id,
    name: contact.broker_name || 'Broker Contact',
    company: `${contact.broker_name || 'Broker'} Logistics`,
    email: contact.broker_email || 'dispatch@example.com',
    phone: `(800) 555-${String(1000 + index)}`,
    mcNumber: `MC-${String(stableHash(contact.id)).slice(0, 6)}`,
    lastLoad: 'Prior lane coverage',
    lastWorkedDate: contact.last_worked_together || 'Recently',
    totalLoads: 3 + (index % 20),
    avgRatePerMile: Number((1.7 + (index % 7) * 0.1).toFixed(2)),
    paymentTerms: 'Net 30',
    preferredLanes: ['National', 'Regional'],
  }));
}

export async function draftOutreachEmail(input: {
  driver: Driver;
  contact: BrokerContact;
  preferredDirection: string;
}): Promise<DraftEmail> {
  const response = await apiFetch<{ subject?: string; body?: string }>('/api/ai/draft-email', {
    method: 'POST',
    body: JSON.stringify({
      driver: {
        name: input.driver.name,
        currentCity: input.driver.currentCity,
        availableTime: 'tomorrow at 6:00 AM',
        trailerType: `${input.driver.trailerType} ${input.driver.trailerLength}`,
        preferredDirection: input.preferredDirection,
      },
      broker: {
        name: input.contact.name,
        company: input.contact.company,
        lastLoadDetails: input.contact.lastLoad,
      },
    }),
  });

  return {
    subject: response.subject || `Coverage request - ${input.contact.company}`,
    body: response.body || 'No draft returned.',
  };
}

export async function uploadOutreachDocument(input: {
  filename: string;
  contentBase64: string;
  documentType?: 'invoice' | 'bol' | 'rate_sheet' | 'contract' | 'other';
  useLlm?: boolean;
}): Promise<OutreachUploadResult> {
  return apiFetch<OutreachUploadResult>('/api/outreach/extract-upload', {
    method: 'POST',
    body: JSON.stringify({
      filename: input.filename,
      contentBase64: input.contentBase64,
      documentType: input.documentType || 'contract',
      useLlm: Boolean(input.useLlm),
    }),
  });
}
