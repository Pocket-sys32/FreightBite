/**
 * API client for FreightBite backend.
 * Uses relative /api when running behind Next (rewrite to backend) or NEXT_PUBLIC_API_URL when set.
 */

const API_BASE =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || ""
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function url(path: string) {
  return `${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T>(
  path: string,
  options?: RequestInit & { parseJson?: boolean }
): Promise<T> {
  const { parseJson = true, ...init } = options ?? {};
  const res = await fetch(url(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const err: { error?: string; details?: string } = await res.json().catch(() => ({}));
    throw new Error(err.error || err.details || `HTTP ${res.status}`);
  }
  if (!parseJson) return undefined as T;
  return res.json() as Promise<T>;
}

// --- Backend response shapes (minimal) ---
export interface ApiLoad {
  id: string;
  origin: string | { lat?: number; lng?: number; label?: string };
  destination: string | { lat?: number; lng?: number; label?: string };
  miles?: number;
  status?: string;
  created_at?: string;
}

export interface ApiLeg {
  id: string;
  load_id: string;
  sequence: number;
  origin: string | { label?: string };
  destination: string | { label?: string };
  miles: number;
  handoff_point: string | { name?: string } | null;
  rate_cents?: number;
  status: string;
  driver_id?: string | null;
}

export interface ApiDriver {
  id: string;
  name: string;
  email: string;
  current_lat?: number | null;
  current_lng?: number | null;
  hos_remaining_hours?: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
  /** Optional; UI may use for display when present */
  hosRemainingHours?: number;
  hosCycleUsed?: number;
}

// --- Mappers: API -> v0 UI types (mock-data.ts) ---
function legOrigin(leg: ApiLeg): string {
  const o = leg.origin;
  return typeof o === "object" && o?.label ? o.label : String(o ?? "—");
}
function legDestination(leg: ApiLeg): string {
  const d = leg.destination;
  return typeof d === "object" && d?.label ? d.label : String(d ?? "—");
}
function legHandoff(leg: ApiLeg): string {
  const h = leg.handoff_point;
  return typeof h === "object" && h?.name ? h.name : String(h ?? "—");
}

export interface UILeg {
  id: string;
  loadId: string;
  sequence: number;
  origin: string;
  originState: string;
  destination: string;
  destinationState: string;
  miles: number;
  deadheadMiles: number;
  handoffPoint: string;
  handoffAddress: string;
  rateCents: number;
  ratePerMile: number;
  fuelSurchargeCents: number;
  status: "OPEN" | "ASSIGNED" | "IN_TRANSIT" | "COMPLETED" | "SEARCHING";
  driverId: string | null;
  driverName: string | null;
  estimatedPickup: string;
  estimatedDelivery: string;
  commodity: string;
  weight: number;
  temperature?: number;
}

function apiLegToUILeg(leg: ApiLeg, drivers: ApiDriver[]): UILeg {
  const driver = leg.driver_id ? drivers.find((d) => d.id === leg.driver_id) : null;
  const status =
    leg.status === "COMPLETE" || leg.status === "Completed"
      ? "COMPLETED"
      : leg.status === "IN_TRANSIT" || leg.status === "in_transit"
        ? "IN_TRANSIT"
        : leg.status === "OPEN" || leg.status === "open"
          ? "OPEN"
          : "ASSIGNED";
  const rateCents = leg.rate_cents ?? Math.round((leg.miles || 0) * 200);
  return {
    id: leg.id,
    loadId: leg.load_id,
    sequence: leg.sequence,
    origin: legOrigin(leg),
    originState: "",
    destination: legDestination(leg),
    destinationState: "",
    miles: leg.miles ?? 0,
    deadheadMiles: 0,
    handoffPoint: legHandoff(leg),
    handoffAddress: legHandoff(leg),
    rateCents,
    ratePerMile: leg.miles ? rateCents / 100 / leg.miles : 0,
    fuelSurchargeCents: 0,
    status,
    driverId: leg.driver_id ?? null,
    driverName: driver?.name ?? null,
    estimatedPickup: "TBD",
    estimatedDelivery: "TBD",
    commodity: "General",
    weight: 0,
  };
}

export interface UILoad {
  id: string;
  referenceNumber: string;
  origin: string;
  destination: string;
  miles: number;
  status: string;
  commodity: string;
  weight: number;
  equipment: string;
  createdAt: string;
  pickupDate: string;
  deliveryDate: string;
  shipper: string;
  consignee: string;
  legs: UILeg[];
}

function loadOrigin(load: ApiLoad): string {
  const o = load.origin;
  return typeof o === "object" && o?.label ? o.label : String(o ?? "—");
}
function loadDestination(load: ApiLoad): string {
  const d = load.destination;
  return typeof d === "object" && d?.label ? d.label : String(d ?? "—");
}

export function apiLoadToUILoad(load: ApiLoad & { legs?: ApiLeg[] }, drivers: ApiDriver[]): UILoad {
  const legs = (load.legs ?? []).map((leg) => apiLegToUILeg(leg, drivers));
  return {
    id: load.id,
    referenceNumber: load.id,
    origin: loadOrigin(load),
    destination: loadDestination(load),
    miles: load.miles ?? 0,
    status: load.status ?? "OPEN",
    commodity: "General",
    weight: 0,
    equipment: "Dry Van 53ft",
    createdAt: load.created_at ?? new Date().toISOString(),
    pickupDate: new Date().toISOString().slice(0, 10),
    deliveryDate: new Date().toISOString().slice(0, 10),
    shipper: "",
    consignee: "",
    legs,
  };
}

// --- API calls ---
export async function getLoads(status?: string): Promise<UILoad[]> {
  const list = await request<ApiLoad[]>(status ? `/api/loads?status=${status}` : "/api/loads");
  const drivers = await getDrivers();
  return list.map((l) => apiLoadToUILoad(l, drivers));
}

export async function getLoad(id: string): Promise<UILoad | null> {
  try {
    const load = await request<ApiLoad & { legs?: ApiLeg[] }>(`/api/loads/${id}`);
    const drivers = await getDrivers();
    return apiLoadToUILoad(load, drivers);
  } catch {
    return null;
  }
}

export async function submitLoad(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const res = await request<{ load: ApiLoad; legs: ApiLeg[] }>("/api/loads/submit", {
    method: "POST",
    body: JSON.stringify({ origin, destination }),
  });
  return res;
}

export async function getLegs(status?: "OPEN" | "IN_TRANSIT" | "COMPLETE"): Promise<UILeg[]> {
  const list = await request<ApiLeg[]>(status ? `/api/legs?status=${status}` : "/api/legs");
  const drivers = await getDrivers();
  return list.map((leg) => apiLegToUILeg(leg, drivers));
}

export async function getDrivers(): Promise<ApiDriver[]> {
  return request<ApiDriver[]>("/api/drivers");
}

export async function createDriver(name: string, email: string): Promise<ApiDriver> {
  return request<ApiDriver>("/api/drivers", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

export async function acceptLeg(legId: string, driverId: string): Promise<ApiLeg> {
  return request<ApiLeg>(`/api/legs/${legId}/accept`, {
    method: "POST",
    body: JSON.stringify({ driver_id: driverId, driverId }),
  });
}

export async function completeLeg(legId: string, driverId: string): Promise<ApiLeg> {
  return request<ApiLeg>(`/api/legs/${legId}/complete`, {
    method: "POST",
    body: JSON.stringify({ driver_id: driverId, driverId }),
  });
}

/** Resolve place name to lat/lng for submit (demo lookup) */
const PLACE_COORDS: Record<string, { lat: number; lng: number }> = {
  "melrose park, il": { lat: 41.9006, lng: -87.8567 },
  "chicago, il": { lat: 41.8781, lng: -87.6298 },
  "rialto, ca": { lat: 34.1064, lng: -117.3703 },
  "los angeles, ca": { lat: 34.0522, lng: -118.2437 },
};

export function placeToCoords(place: string): { lat: number; lng: number } | null {
  const key = place.trim().toLowerCase();
  return PLACE_COORDS[key] ?? null;
}
