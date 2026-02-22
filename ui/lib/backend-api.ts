import type { BrokerContact, Driver, Leg, LegStatus, Load, NearbyLoad } from "@/lib/mock-data"

const AUTH_TOKEN_KEY = "freightbite_driver_token"
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/, "")

function isBrowser() {
  return typeof window !== "undefined"
}

export function getAuthToken(): string | null {
  if (!isBrowser()) return null
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

export function saveAuthToken(token: string) {
  if (!isBrowser()) return
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken() {
  if (!isBrowser()) return
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

type RawPoint =
  | string
  | {
      lat?: number
      lng?: number
      label?: string
      name?: string
    }
  | null
  | undefined

interface RawLoad {
  id: string
  origin: RawPoint
  destination: RawPoint
  miles?: number
  contract_total_payout_cents?: number | null
  status?: string
  created_at?: string
  legs?: RawLeg[]
}

interface RawLeg {
  id: string
  load_id: string
  sequence: number
  origin: RawPoint
  destination: RawPoint
  miles?: number
  handoff_point?: RawPoint
  rate_cents?: number
  payout_per_mile_cents?: number | null
  status?: string
  driver_id?: string | null
  origin_address?: string | null
  destination_address?: string | null
}

interface RawDriver {
  id: string
  name: string
  email: string
  current_lat?: number | null
  current_lng?: number | null
  hos_remaining_hours?: number | null
  home_lat?: number | null
  home_lng?: number | null
}

interface RawContact {
  id: string
  broker_name?: string | null
  broker_email?: string | null
  last_worked_together?: string | null
}

interface RawLegEvent {
  id: string
  leg_id: string
  driver_id?: string | null
  event_type: string
  payload?: unknown
  created_at?: string
}

interface RawHandoff {
  id: string
  from_leg_id: string
  to_leg_id: string
  from_driver_id?: string | null
  to_driver_id?: string | null
  status: "PENDING" | "READY" | "COMPLETE"
  updated_at?: string
}

interface RawLegWorkflow {
  phase: string
  latestEvent: RawLegEvent | null
  events: RawLegEvent[]
  previousLeg: RawLeg | null
  nextLeg: RawLeg | null
  handoffs: RawHandoff[]
}

interface RawDirections {
  legId: string
  from: { lat: number; lng: number; label: string }
  to: { lat: number; lng: number; label: string }
  directions: {
    distanceMiles: number
    durationMinutes: number
    geometry: number[][]
    steps: Array<{
      distanceMiles: number
      durationMinutes: number
      name: string
      maneuver: string
      instruction: string
      location: { lat: number; lng: number } | null
    }>
  }
}

export interface LegEvent {
  id: string
  legId: string
  driverId: string | null
  eventType: string
  payload: unknown
  createdAt: string | null
}

export interface HandoffLink {
  id: string
  fromLegId: string
  toLegId: string
  fromDriverId: string | null
  toDriverId: string | null
  status: "PENDING" | "READY" | "COMPLETE"
  updatedAt: string | null
}

export interface LegWorkflow {
  phase: string
  latestEvent: LegEvent | null
  events: LegEvent[]
  previousLeg: Leg | null
  nextLeg: Leg | null
  handoffs: HandoffLink[]
}

export interface LegDirectionsStep {
  distanceMiles: number
  durationMinutes: number
  name: string
  maneuver: string
  instruction: string
  location: { lat: number; lng: number } | null
}

export interface LegDirections {
  legId: string
  from: { lat: number; lng: number; label: string }
  to: { lat: number; lng: number; label: string }
  directions: {
    distanceMiles: number
    durationMinutes: number
    geometry: Array<{ lat: number; lng: number }>
    steps: LegDirectionsStep[]
  }
}

const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number; label: string }> = {
  "melrose park, il": { lat: 41.9006, lng: -87.8567, label: "Melrose Park, IL" },
  "chicago, il": { lat: 41.8781, lng: -87.6298, label: "Chicago, IL" },
  "coralville, ia": { lat: 41.6766, lng: -91.5918, label: "Coralville, IA" },
  "iowa city, ia": { lat: 41.6611, lng: -91.5302, label: "Iowa City, IA" },
  "north platte, ne": { lat: 41.1239, lng: -100.7654, label: "North Platte, NE" },
  "st. george, ut": { lat: 37.0965, lng: -113.5684, label: "St. George, UT" },
  "barstow, ca": { lat: 34.8958, lng: -117.0173, label: "Barstow, CA" },
  "rialto, ca": { lat: 34.1064, lng: -117.3703, label: "Rialto, CA" },
  "los angeles, ca": { lat: 34.0522, lng: -118.2437, label: "Los Angeles, CA" },
  "omaha, ne": { lat: 41.2565, lng: -95.9345, label: "Omaha, NE" },
  "denver, co": { lat: 39.7392, lng: -104.9903, label: "Denver, CO" },
}
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const TRAILER_TYPES: Driver["trailerType"][] = ["Dry Van", "Reefer", "Flatbed", "Step Deck"]
const TRAILER_LENGTHS: Driver["trailerLength"][] = ["53ft", "48ft"]
const ELD_PROVIDERS = ["Samsara", "Motive", "Geotab", "KeepTruckin"]

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function pointLabel(point: RawPoint, fallback: string): string {
  if (!point) return fallback
  if (typeof point === "string") return point
  if (typeof point.label === "string" && point.label.trim().length > 0) return point.label
  if (typeof point.name === "string" && point.name.trim().length > 0) return point.name
  if (typeof point.lat === "number" && typeof point.lng === "number") {
    return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`
  }
  return fallback
}

function pointCoords(point: RawPoint): { lat?: number; lng?: number } {
  if (point && typeof point === "object") {
    return { lat: point.lat, lng: point.lng }
  }
  return {}
}

function stateFromLabel(label: string): string {
  const match = label.match(/,\s*([A-Za-z]{2})$/)
  return match ? match[1].toUpperCase() : "--"
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function statusToUi(rawStatus: string | undefined, driverId: string | null | undefined): LegStatus {
  const status = (rawStatus || "").toUpperCase()
  if (status === "IN_TRANSIT") return "IN_TRANSIT"
  if (status === "COMPLETE" || status === "COMPLETED") return "COMPLETED"
  if (status === "OPEN" && driverId) return "ASSIGNED"
  if (status === "OPEN") return "OPEN"
  return "OPEN"
}

function stableHash(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash
}

function nearestKnownLabel(lat?: number | null, lng?: number | null, fallback = "Unknown"): string {
  if (typeof lat !== "number" || typeof lng !== "number") return fallback

  let best = fallback
  let bestScore = Number.POSITIVE_INFINITY

  for (const item of Object.values(KNOWN_LOCATIONS)) {
    const score = Math.pow(item.lat - lat, 2) + Math.pow(item.lng - lng, 2)
    if (score < bestScore) {
      bestScore = score
      best = item.label
    }
  }

  return best
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers ? (init.headers as Record<string, string>) : {}),
  }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : API_ORIGIN
    ? `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`
    : path

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text) as { error?: string; details?: string }
      const details = parsed.details ? ` (${parsed.details})` : ""
      throw new Error((parsed.error || text || `API request failed (${response.status})`) + details)
    } catch {
      throw new Error(text || `API request failed (${response.status})`)
    }
  }

  return response.json() as Promise<T>
}

function mapDriver(raw: RawDriver): Driver {
  const hash = stableHash(raw.id)
  const currentCity = nearestKnownLabel(raw.current_lat ?? null, raw.current_lng ?? null, "On Route")
  const homeCity = nearestKnownLabel(raw.home_lat ?? null, raw.home_lng ?? null, "Home Base")
  const hosRemainingHours = Number(Math.max(0, Math.min(11, toNumber(raw.hos_remaining_hours, 11))).toFixed(1))
  const fallbackLat =
    typeof raw.home_lat === "number" && Number.isFinite(raw.home_lat) ? raw.home_lat : 39.5
  const fallbackLng =
    typeof raw.home_lng === "number" && Number.isFinite(raw.home_lng) ? raw.home_lng : -98.35

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
    lastRestartDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    homeLat: toNumber(raw.home_lat, 0),
    homeLng: toNumber(raw.home_lng, 0),
    homeCity,
    currentCity,
    rating: Number((4.2 + (hash % 8) * 0.1).toFixed(1)),
    totalLoads: 200 + (hash % 1200),
    trailerType: TRAILER_TYPES[hash % TRAILER_TYPES.length],
    trailerLength: TRAILER_LENGTHS[hash % TRAILER_LENGTHS.length],
    eldProvider: ELD_PROVIDERS[hash % ELD_PROVIDERS.length],
  }
}

function mapLeg(raw: RawLeg, driverNameById: Map<string, string>): Leg {
  const miles = Number(toNumber(raw.miles, 0).toFixed(1))
  const rateCents =
    typeof raw.rate_cents === "number" && raw.rate_cents > 0
      ? raw.rate_cents
      : Math.round(miles * 185)
  const fuelSurchargeCents = Math.round(miles * 32)
  const ratePerMile =
    typeof raw.payout_per_mile_cents === "number" && Number.isFinite(raw.payout_per_mile_cents)
      ? Number((raw.payout_per_mile_cents / 100).toFixed(2))
      : miles > 0
      ? Number((rateCents / miles / 100).toFixed(2))
      : 0
  const origin = pointLabel(raw.origin, "Origin")
  const destination = pointLabel(raw.destination, "Destination")
  const originCoords = pointCoords(raw.origin)
  const destinationCoords = pointCoords(raw.destination)
  const handoffPoint = pointLabel(raw.handoff_point, "Handoff Point")
  const handoffCoords = pointCoords(raw.handoff_point)
  const handoffAddress =
    typeof handoffCoords.lat === "number" && typeof handoffCoords.lng === "number"
      ? `${handoffCoords.lat.toFixed(4)}, ${handoffCoords.lng.toFixed(4)}`
      : handoffPoint
  const sequence = toNumber(raw.sequence, 1)
  const pickupDate = new Date(Date.now() + sequence * 3 * 60 * 60 * 1000)
  const deliveryDate = new Date(pickupDate.getTime() + Math.max(2, miles / 55) * 60 * 60 * 1000)
  const driverId = raw.driver_id || null

  return {
    id: raw.id,
    loadId: raw.load_id,
    sequence,
    origin,
    originState: stateFromLabel(origin),
    originAddress: raw.origin_address || pointLabel(raw.origin, "Origin"),
    originLat: typeof originCoords.lat === "number" ? originCoords.lat : undefined,
    originLng: typeof originCoords.lng === "number" ? originCoords.lng : undefined,
    destination,
    destinationState: stateFromLabel(destination),
    destinationAddress: raw.destination_address || pointLabel(raw.destination, "Destination"),
    destinationLat: typeof destinationCoords.lat === "number" ? destinationCoords.lat : undefined,
    destinationLng: typeof destinationCoords.lng === "number" ? destinationCoords.lng : undefined,
    miles,
    deadheadMiles: 0,
    handoffPoint,
    handoffAddress,
    rateCents,
    ratePerMile,
    fuelSurchargeCents,
    status: statusToUi(raw.status, driverId),
    driverId,
    driverName: driverId ? driverNameById.get(driverId) || null : null,
    estimatedPickup: formatDate(pickupDate),
    estimatedDelivery: formatDate(deliveryDate),
    commodity: "General Freight",
    weight: 38000,
  }
}

function mapLegEvent(raw: RawLegEvent | null | undefined): LegEvent | null {
  if (!raw) return null
  return {
    id: raw.id,
    legId: raw.leg_id,
    driverId: raw.driver_id || null,
    eventType: raw.event_type,
    payload: raw.payload ?? null,
    createdAt: raw.created_at || null,
  }
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
  }
}

function mapWorkflow(raw: RawLegWorkflow | null | undefined, driverNames: Map<string, string>): LegWorkflow {
  return {
    phase: raw?.phase || "OPEN",
    latestEvent: mapLegEvent(raw?.latestEvent),
    events: (raw?.events || []).map((event) => mapLegEvent(event)).filter(Boolean) as LegEvent[],
    previousLeg: raw?.previousLeg ? mapLeg(raw.previousLeg, driverNames) : null,
    nextLeg: raw?.nextLeg ? mapLeg(raw.nextLeg, driverNames) : null,
    handoffs: (raw?.handoffs || []).map(mapHandoff),
  }
}

function mapDirections(raw: RawDirections): LegDirections {
  return {
    legId: raw.legId,
    from: raw.from,
    to: raw.to,
    directions: {
      distanceMiles: raw.directions.distanceMiles,
      durationMinutes: raw.directions.durationMinutes,
      geometry: (raw.directions.geometry || []).map(([lng, lat]) => ({ lat, lng })),
      steps: raw.directions.steps || [],
    },
  }
}

function mapLoad(raw: RawLoad, legs: RawLeg[], driverNameById: Map<string, string>): Load {
  const origin = pointLabel(raw.origin, "Origin")
  const destination = pointLabel(raw.destination, "Destination")
  const mappedLegs = legs.map((leg) => mapLeg(leg, driverNameById)).sort((a, b) => a.sequence - b.sequence)
  const totalMiles =
    typeof raw.miles === "number" && Number.isFinite(raw.miles)
      ? raw.miles
      : mappedLegs.reduce((sum, leg) => sum + leg.miles, 0)
  const createdAt = raw.created_at || new Date().toISOString()
  const createdDate = new Date(createdAt)
  const deliveryDate = new Date(createdDate.getTime() + 2 * 24 * 60 * 60 * 1000)

  return {
    id: raw.id,
    referenceNumber: `FB-${String(raw.id).slice(0, 8).toUpperCase()}`,
    origin,
    destination,
    miles: Number(totalMiles.toFixed(1)),
    contractTotalPayoutCents:
      typeof raw.contract_total_payout_cents === "number" && Number.isFinite(raw.contract_total_payout_cents)
        ? raw.contract_total_payout_cents
        : undefined,
    status: raw.status || "OPEN",
    commodity: "General Freight",
    weight: 38000,
    equipment: "Dry Van 53ft",
    createdAt,
    pickupDate: createdDate.toISOString().slice(0, 10),
    deliveryDate: deliveryDate.toISOString().slice(0, 10),
    shipper: origin,
    consignee: destination,
    legs: mappedLegs,
  }
}

function mapContact(raw: RawContact): BrokerContact {
  const name = raw.broker_name || "Broker Contact"
  const hash = stableHash(raw.id)

  return {
    id: raw.id,
    name,
    company: `${name} Logistics`,
    email: raw.broker_email || "dispatch@example.com",
    phone: `(800) 555-${String(1000 + (hash % 9000))}`,
    mcNumber: `MC-${String(hash).slice(0, 6)}`,
    lastLoad: "Prior lane coverage",
    lastWorkedDate: raw.last_worked_together || "Recently",
    totalLoads: 3 + (hash % 20),
    avgRatePerMile: Number((1.7 + (hash % 7) * 0.1).toFixed(2)),
    paymentTerms: "Net 30",
    preferredLanes: ["National", "Regional"],
  }
}

async function geocodeAddress(input: string): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null

  const params = new URLSearchParams({
    address: input,
    key: GOOGLE_MAPS_API_KEY,
  })

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`)
    if (!response.ok) return null

    const payload = (await response.json()) as {
      status?: string
      results?: Array<{
        formatted_address?: string
        geometry?: { location?: { lat?: number; lng?: number } }
      }>
    }
    const first = payload.results?.[0]
    const lat = first?.geometry?.location?.lat
    const lng = first?.geometry?.location?.lng
    if (payload.status !== "OK" || typeof lat !== "number" || typeof lng !== "number") return null

    return {
      lat,
      lng,
      label: first?.formatted_address || input,
    }
  } catch {
    return null
  }
}

async function resolveLocation(input: string): Promise<{ lat: number; lng: number; label: string }> {
  const geocoded = await geocodeAddress(input)
  if (geocoded) return geocoded

  const normalized = input.trim().toLowerCase()
  const known = KNOWN_LOCATIONS[normalized]
  if (known) return known

  for (const [key, location] of Object.entries(KNOWN_LOCATIONS)) {
    if (normalized.includes(key)) return location
  }

  const latLngMatch = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (latLngMatch) {
    const lat = Number(latLngMatch[1])
    const lng = Number(latLngMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
    }
  }

  throw new Error(`Unknown location "${input}". Use a valid address, known city, or "lat,lng".`)
}

async function fetchDriverNames(): Promise<Map<string, string>> {
  const rawDrivers = await apiFetch<RawDriver[]>("/api/drivers")
  const map = new Map<string, string>()
  for (const driver of rawDrivers || []) {
    map.set(driver.id, driver.name)
  }
  return map
}

export async function fetchDrivers(): Promise<Driver[]> {
  const raw = await apiFetch<RawDriver[]>("/api/drivers")
  return (raw || []).map(mapDriver)
}

export async function registerDriverAccount(input: {
  name: string
  email: string
  password: string
  currentLat?: number
  currentLng?: number
  homeLat?: number
  homeLng?: number
}) {
  const response = await apiFetch<{ token: string; driver: RawDriver }>("/api/auth/register-driver", {
    method: "POST",
    body: JSON.stringify(input),
  })
  saveAuthToken(response.token)
  return mapDriver(response.driver)
}

export async function loginDriverAccount(email: string, password: string) {
  const response = await apiFetch<{ token: string; driver: RawDriver }>("/api/auth/login-driver", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  saveAuthToken(response.token)
  return mapDriver(response.driver)
}

export async function createOAuthDriverSession(input: {
  email: string
  name?: string
  currentLat?: number
  currentLng?: number
  homeLat?: number
  homeLng?: number
}) {
  const response = await apiFetch<{ token: string; driver: RawDriver }>("/api/auth/oauth-session", {
    method: "POST",
    body: JSON.stringify(input),
  })
  saveAuthToken(response.token)
  return mapDriver(response.driver)
}

export async function fetchCurrentDriver(): Promise<Driver | null> {
  try {
    const response = await apiFetch<{ driver: RawDriver }>("/api/auth/me")
    return mapDriver(response.driver)
  } catch {
    return null
  }
}

export async function updateDriverLiveLocation(input: {
  lat: number
  lng: number
  accuracy?: number
}): Promise<Driver> {
  const response = await apiFetch<{ driver: RawDriver }>("/api/drivers/me/location", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
  return mapDriver(response.driver)
}

export async function fetchDriverContacts(driverId: string): Promise<BrokerContact[]> {
  const raw = await apiFetch<RawContact[]>(`/api/drivers/${driverId}/contacts`)
  return (raw || []).map(mapContact)
}

export async function fetchLegs(options?: { status?: string; loadId?: string; driverId?: string }): Promise<Leg[]> {
  const params = new URLSearchParams()
  if (options?.status) params.set("status", options.status)
  if (options?.loadId) params.set("loadId", options.loadId)
  if (options?.driverId) params.set("driverId", options.driverId)
  const query = params.toString()
  const driverNames = await fetchDriverNames()
  const rawLegs = await apiFetch<RawLeg[]>(`/api/legs${query ? `?${query}` : ""}`)
  return (rawLegs || []).map((leg) => mapLeg(leg, driverNames))
}

export async function fetchLoadById(loadId: string): Promise<Load | null> {
  try {
    const driverNames = await fetchDriverNames()
    const rawLoad = await apiFetch<RawLoad>(`/api/loads/${loadId}`)
    const legs = Array.isArray(rawLoad.legs) ? rawLoad.legs : []
    return mapLoad(rawLoad, legs, driverNames)
  } catch {
    return null
  }
}

export async function fetchLatestLoad(): Promise<Load | null> {
  const loads = await apiFetch<RawLoad[]>("/api/loads?limit=1")
  if (!loads || loads.length === 0) return null
  return fetchLoadById(loads[0].id)
}

export async function submitLoadByLabel(
  originInput: string,
  destinationInput: string,
  totalContractPrice: number
): Promise<Load> {
  const [origin, destination] = await Promise.all([
    resolveLocation(originInput),
    resolveLocation(destinationInput),
  ])
  const response = await apiFetch<{ load: RawLoad; legs: RawLeg[] }>("/api/loads/submit", {
    method: "POST",
    body: JSON.stringify({ origin, destination, totalContractPrice }),
  })

  const driverNames = await fetchDriverNames()
  return mapLoad(response.load, response.legs || [], driverNames)
}

export async function acceptLeg(legId: string, driverId: string): Promise<{ leg: Leg; workflow: LegWorkflow }> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow }>(`/api/legs/${legId}/accept`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  })
  const driverNames = await fetchDriverNames()
  return {
    leg: mapLeg(response.leg, driverNames),
    workflow: mapWorkflow(response.workflow, driverNames),
  }
}

export async function startLegRoute(legId: string, driverId: string): Promise<{ leg: Leg; workflow: LegWorkflow }> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow }>(`/api/legs/${legId}/start-route`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  })
  const driverNames = await fetchDriverNames()
  return {
    leg: mapLeg(response.leg, driverNames),
    workflow: mapWorkflow(response.workflow, driverNames),
  }
}

export async function arriveAtLegStop(legId: string, driverId: string): Promise<{ leg: Leg; workflow: LegWorkflow }> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow }>(`/api/legs/${legId}/arrive`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  })
  const driverNames = await fetchDriverNames()
  return {
    leg: mapLeg(response.leg, driverNames),
    workflow: mapWorkflow(response.workflow, driverNames),
  }
}

export async function pauseLegRoute(legId: string, driverId: string): Promise<{ leg: Leg; workflow: LegWorkflow }> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow }>(`/api/legs/${legId}/pause-route`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  })
  const driverNames = await fetchDriverNames()
  return {
    leg: mapLeg(response.leg, driverNames),
    workflow: mapWorkflow(response.workflow, driverNames),
  }
}

export async function resumeLegRoute(legId: string, driverId: string): Promise<{ leg: Leg; workflow: LegWorkflow }> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow }>(`/api/legs/${legId}/resume-route`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  })
  const driverNames = await fetchDriverNames()
  return {
    leg: mapLeg(response.leg, driverNames),
    workflow: mapWorkflow(response.workflow, driverNames),
  }
}

export async function finishLegHandoff(
  legId: string,
  driverId: string,
  location?: { currentLat?: number; currentLng?: number; accuracy?: number }
): Promise<{ leg: Leg; workflow: LegWorkflow; autoStartedNextLeg?: Leg | null }> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow; autoStartedNextLeg?: RawLeg | null }>(
    `/api/legs/${legId}/handoff`,
    {
      method: "POST",
      body: JSON.stringify({
        driverId,
        currentLat: location?.currentLat,
        currentLng: location?.currentLng,
        accuracy: location?.accuracy,
      }),
    }
  )
  const driverNames = await fetchDriverNames()
  return {
    leg: mapLeg(response.leg, driverNames),
    workflow: mapWorkflow(response.workflow, driverNames),
    autoStartedNextLeg: response.autoStartedNextLeg ? mapLeg(response.autoStartedNextLeg, driverNames) : null,
  }
}

export async function fetchLegWorkflow(legId: string): Promise<LegWorkflow> {
  const response = await apiFetch<{ leg: RawLeg; workflow: RawLegWorkflow }>(`/api/legs/${legId}/workflow`)
  const driverNames = await fetchDriverNames()
  return mapWorkflow(response.workflow, driverNames)
}

export async function fetchLegDirections(legId: string, driverId?: string): Promise<LegDirections> {
  const params = new URLSearchParams()
  if (driverId) params.set("driverId", driverId)
  const query = params.toString()
  const response = await apiFetch<RawDirections>(`/api/legs/${legId}/directions${query ? `?${query}` : ""}`)
  return mapDirections(response)
}

export function legsToNearbyLoads(legs: Leg[]): NearbyLoad[] {
  return legs.map((leg, index) => ({
    id: leg.id,
    origin: leg.origin,
    originState: leg.originState,
    destination: leg.destination,
    destinationState: leg.destinationState,
    miles: leg.miles,
    deadheadMiles: leg.deadheadMiles,
    rateCents: leg.rateCents + leg.fuelSurchargeCents,
    ratePerMile: leg.ratePerMile,
    pickupTime: leg.estimatedPickup,
    equipment: "Dry Van 53ft",
    commodity: leg.commodity,
    weight: leg.weight,
    broker: "FreightBite Network",
    direction: `${leg.originState} -> ${leg.destinationState}`,
    postedAt: new Date(Date.now() - index * 45 * 60 * 1000).toISOString(),
  }))
}

export async function fetchWhatsNextRecommendation(driver: Driver, nearbyLoads: NearbyLoad[]) {
  return apiFetch<{ recommendation?: string; topLoad?: NearbyLoad | null; reasoning?: string }>(
    "/api/ai/whats-next",
    {
      method: "POST",
      body: JSON.stringify({
        driver: {
          currentCity: driver.currentCity,
          homeCity: driver.homeCity,
          homeMilesAway: Math.max(80, Math.round(driver.hosRemainingHours * 45)),
        },
        nearbyLoads,
      }),
    }
  )
}

export async function draftOutreachEmail(args: {
  driver: Driver
  contact: BrokerContact
  preferredDirection: string
}): Promise<{ subject: string; body: string }> {
  const { driver, contact, preferredDirection } = args
  const response = await apiFetch<{ subject?: string; body?: string }>("/api/ai/draft-email", {
    method: "POST",
    body: JSON.stringify({
      driver: {
        name: driver.name,
        currentCity: driver.currentCity,
        availableTime: "tomorrow at 6:00 AM",
        trailerType: `${driver.trailerType} ${driver.trailerLength}`,
        preferredDirection,
      },
      broker: {
        name: contact.name,
        company: contact.company,
        lastLoadDetails: contact.lastLoad,
      },
    }),
  })

  return {
    subject: response.subject || `Coverage request - ${contact.company}`,
    body: response.body || "No draft returned.",
  }
}

export async function askOutreachAssistant(args: {
  question: string
  contacts: BrokerContact[]
  gapLeg: Leg | null
  driver: Driver | null
}): Promise<{ answer: string; fallback?: boolean; details?: string }> {
  return apiFetch<{ answer: string; fallback?: boolean; details?: string }>("/api/ai/outreach-chat", {
    method: "POST",
    body: JSON.stringify(args),
  })
}

export interface OutreachUploadResult {
  filename: string
  documentId: string | null
  extracted: Record<string, unknown> | null
  linked: {
    localContactCreated: boolean
    companyId: string | null
    contractId: string | null
    contractContactId: string | null
    ratesLinked: number
  }
}

export async function uploadOutreachDocument(input: {
  filename: string
  contentBase64: string
  documentType?: "invoice" | "bol" | "rate_sheet" | "contract" | "other"
  useLlm?: boolean
}): Promise<OutreachUploadResult> {
  return apiFetch<OutreachUploadResult>("/api/outreach/extract-upload", {
    method: "POST",
    body: JSON.stringify({
      filename: input.filename,
      contentBase64: input.contentBase64,
      documentType: input.documentType || "contract",
      useLlm: Boolean(input.useLlm),
    }),
  })
}
