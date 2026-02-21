import type { BrokerContact, Driver, Leg, LegStatus, Load, NearbyLoad } from "@/lib/mock-data"

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
  status?: string
  driver_id?: string | null
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
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `API request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

function mapDriver(raw: RawDriver): Driver {
  const hash = stableHash(raw.id)
  const currentCity = nearestKnownLabel(raw.current_lat ?? null, raw.current_lng ?? null, "On Route")
  const homeCity = nearestKnownLabel(raw.home_lat ?? null, raw.home_lng ?? null, "Home Base")
  const hosRemainingHours = Number(toNumber(raw.hos_remaining_hours, 7).toFixed(1))

  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    mcNumber: `MC-${String(hash).slice(0, 7)}`,
    dotNumber: `${1000000 + (hash % 9000000)}`,
    currentLat: toNumber(raw.current_lat, 0),
    currentLng: toNumber(raw.current_lng, 0),
    hosRemainingHours,
    hosCycleUsed: Number(Math.max(0, Math.min(70, 70 - hosRemainingHours * 4.5)).toFixed(1)),
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
  const ratePerMile = miles > 0 ? Number((rateCents / miles / 100).toFixed(2)) : 0
  const origin = pointLabel(raw.origin, "Origin")
  const destination = pointLabel(raw.destination, "Destination")
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
    destination,
    destinationState: stateFromLabel(destination),
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

function resolveLocation(input: string): { lat: number; lng: number; label: string } {
  const normalized = input.trim().toLowerCase()
  const known = KNOWN_LOCATIONS[normalized]
  if (known) return known

  const latLngMatch = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (latLngMatch) {
    const lat = Number(latLngMatch[1])
    const lng = Number(latLngMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
    }
  }

  throw new Error(`Unknown location "${input}". Use a known city (e.g. Chicago, IL) or "lat,lng".`)
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

export async function fetchDriverContacts(driverId: string): Promise<BrokerContact[]> {
  const raw = await apiFetch<RawContact[]>(`/api/drivers/${driverId}/contacts`)
  return (raw || []).map(mapContact)
}

export async function fetchLegs(options?: { status?: string; loadId?: string }): Promise<Leg[]> {
  const params = new URLSearchParams()
  if (options?.status) params.set("status", options.status)
  if (options?.loadId) params.set("loadId", options.loadId)
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

export async function submitLoadByLabel(originInput: string, destinationInput: string): Promise<Load> {
  const origin = resolveLocation(originInput)
  const destination = resolveLocation(destinationInput)
  const response = await apiFetch<{ load: RawLoad; legs: RawLeg[] }>("/api/loads/submit", {
    method: "POST",
    body: JSON.stringify({ origin, destination }),
  })

  const driverNames = await fetchDriverNames()
  return mapLoad(response.load, response.legs || [], driverNames)
}

export async function acceptLeg(legId: string, driverId: string): Promise<void> {
  await apiFetch(`/api/legs/${legId}/accept`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  })
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
