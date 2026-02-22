"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Home,
  Truck,
  MapPin,
  Clock,
  CheckCircle2,
  ArrowRight,
  Package,
  Loader2,
  AlertCircle,
  Navigation,
  Crosshair,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { type Driver, HOS_RULES, type NearbyLoad } from "@/lib/mock-data"
import {
  fetchCurrentDriver,
  fetchLegs,
  fetchWhatsNextRecommendation,
  legsToNearbyLoads,
  geocodeAddress,
  reverseGeocode,
} from "@/lib/backend-api"

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function scoreLoad(load: NearbyLoad, driverPos: { lat: number; lng: number } | null): number {
  const rateScore = load.ratePerMile * 40
  if (!driverPos) return rateScore

  const originLat = parseFloat(String(load.origin.split(",").pop()?.trim())) || 0
  const deadhead = load.deadheadMiles || 0
  const proxPenalty = deadhead > 0 ? deadhead * 0.5 : 0
  return rateScore - proxPenalty
}

function pickStayLoad(loads: NearbyLoad[], driverPos: { lat: number; lng: number } | null) {
  if (loads.length === 0) return null
  return [...loads].sort((a, b) => scoreLoad(b, driverPos) - scoreLoad(a, driverPos))[0]
}

function pickHomeLoad(loads: NearbyLoad[], driver: Driver | null, excludeId?: string) {
  if (!driver || loads.length === 0) return null
  const homeState = driver.homeCity.split(",").pop()?.trim().toUpperCase() || ""
  const candidates = loads.filter((l) => l.id !== excludeId)
  if (candidates.length === 0) return null
  return (
    candidates.find((l) => l.destinationState === homeState) ||
    candidates.find((l) => l.originState === homeState) ||
    candidates[0]
  )
}

const HOME_STORAGE_KEY = "freightbite_home"

export type SavedHome = { lat: number; lng: number; label: string }

function getSavedHome(): SavedHome | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(HOME_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && "lat" in parsed && "lng" in parsed) {
      const { lat, lng } = parsed as { lat: number; lng: number; label?: string }
      if (typeof lat === "number" && typeof lng === "number") {
        const label = (parsed as { label?: string }).label ?? "Home"
        return { lat, lng, label }
      }
    }
  } catch {
    // ignore
  }
  return null
}

function setSavedHome(home: SavedHome | null) {
  if (typeof window === "undefined") return
  if (home) window.localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(home))
  else window.localStorage.removeItem(HOME_STORAGE_KEY)
}

function buildDeadheadHome(
  driver: Driver | null,
  homeMiles: number,
  homeLabel: string,
  currentLocationLabel: string
): NearbyLoad {
  const homeState = driver?.homeCity?.split(",").pop()?.trim().toUpperCase() || "HOME"
  return {
    id: "home-deadhead-option",
    origin: currentLocationLabel || "Current Location",
    originState: currentLocationLabel?.split(",").pop()?.trim().toUpperCase() || "--",
    destination: homeLabel,
    destinationState: homeState,
    miles: homeMiles,
    deadheadMiles: homeMiles,
    rateCents: 0,
    ratePerMile: 0,
    pickupTime: "Now",
    equipment: driver ? `${driver.trailerType} ${driver.trailerLength}` : "Truck",
    commodity: "Return Home",
    weight: 0,
    broker: "Personal Route",
    direction: "HOME",
    postedAt: new Date().toISOString(),
  }
}

export default function WhatsNextPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [nearbyLoads, setNearbyLoads] = useState<NearbyLoad[]>([])
  const [recommended, setRecommended] = useState<"HOME" | "STAY">("STAY")
  const [reasoning, setReasoning] = useState("Evaluating nearby loads...")
  const [choice, setChoice] = useState<"HOME" | "STAY" | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<string>("acquiring")
  const [savedHome, setSavedHomeState] = useState<SavedHome | null>(null)
  const [homeInput, setHomeInput] = useState("")
  const [homeInputError, setHomeInputError] = useState<string | null>(null)
  const [homeInputLoading, setHomeInputLoading] = useState(false)
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null)

  useEffect(() => {
    setSavedHomeState(getSavedHome())
  }, [])

  useEffect(() => {
    if (!gpsPos) {
      setCurrentLocationLabel(null)
      return
    }
    let cancelled = false
    reverseGeocode(gpsPos.lat, gpsPos.lng).then((label) => {
      if (!cancelled && label) setCurrentLocationLabel(label)
    })
    return () => {
      cancelled = true
    }
  }, [gpsPos?.lat, gpsPos?.lng])

  const homePosition = useMemo(() => {
    if (savedHome) return { lat: savedHome.lat, lng: savedHome.lng, label: savedHome.label }
    if (driver?.homeLat != null && driver?.homeLng != null) {
      return { lat: driver.homeLat, lng: driver.homeLng, label: driver.homeCity || "Home" }
    }
    return null
  }, [savedHome, driver?.homeLat, driver?.homeLng, driver?.homeCity])

  const homeMiles = useMemo(() => {
    if (!homePosition || !gpsPos) return null
    return Math.round(haversineMiles(gpsPos, { lat: homePosition.lat, lng: homePosition.lng }))
  }, [homePosition, gpsPos])

  const homeLabel = homePosition?.label ?? driver?.homeCity ?? "Home Base"

  const setHomeToCurrentLocation = useCallback(() => {
    if (!gpsPos) return
    const home: SavedHome = { lat: gpsPos.lat, lng: gpsPos.lng, label: "Home" }
    setSavedHome(home)
    setSavedHomeState(home)
  }, [gpsPos])

  const clearHome = useCallback(() => {
    setSavedHome(null)
    setSavedHomeState(null)
    setHomeInput("")
    setHomeInputError(null)
  }, [])

  const setHomeFromCityState = useCallback(async () => {
    const raw = homeInput.trim()
    if (!raw) {
      setHomeInputError("Enter a city and state, e.g. Manteca, CA")
      return
    }
    setHomeInputError(null)
    setHomeInputLoading(true)
    try {
      const result = await geocodeAddress(raw)
      if (!result) {
        setHomeInputError("Could not find that location. Try \"City, State\" (e.g. Manteca, CA).")
        return
      }
      const home: SavedHome = { lat: result.lat, lng: result.lng, label: result.label }
      setSavedHome(home)
      setSavedHomeState(home)
      setHomeInput("")
    } catch {
      setHomeInputError("Geocoding failed. Check your connection or try another location.")
    } finally {
      setHomeInputLoading(false)
    }
  }, [homeInput])

  const gpsPosRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastGpsUpdateRef = useRef<number>(0)
  const GPS_THROTTLE_MS = 15000

  useEffect(() => {
    if (typeof window === "undefined" || !window.navigator?.geolocation) {
      setGpsStatus("unavailable")
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const now = Date.now()
        const prev = gpsPosRef.current
        const same = prev && Math.abs(prev.lat - next.lat) < 1e-5 && Math.abs(prev.lng - next.lng) < 1e-5
        if (same && now - lastGpsUpdateRef.current < GPS_THROTTLE_MS) return
        gpsPosRef.current = next
        lastGpsUpdateRef.current = now
        setGpsPos(next)
        setGpsStatus("live")
      },
      () => setGpsStatus("blocked"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const loadData = async () => {
      try {
        const selectedDriver = await fetchCurrentDriver()
        if (cancelled) return
        setDriver(selectedDriver)

        const openLegs = await fetchLegs({ status: "OPEN" })
        if (cancelled) return
        let loads = legsToNearbyLoads(openLegs)

        const pos = gpsPosRef.current
        if (pos && loads.length > 0) {
          loads.sort((a, b) => {
            const aScore = a.ratePerMile * 100 - (a.deadheadMiles || 0) * 0.3
            const bScore = b.ratePerMile * 100 - (b.deadheadMiles || 0) * 0.3
            return bScore - aScore
          })
        }

        loads = loads.slice(0, 6)
        setNearbyLoads(loads)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load data")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const stayLoad = useMemo(() => pickStayLoad(nearbyLoads, gpsPos), [nearbyLoads, gpsPos])
  const locationDisplay = currentLocationLabel ?? driver?.currentCity ?? "Current location"

  const homeLoad = useMemo(() => {
    const picked = pickHomeLoad(nearbyLoads, driver, stayLoad?.id)
    const miles = homeMiles ?? (driver ? Math.max(80, Math.round((driver.hosRemainingHours || 6) * 45)) : 200)
    return picked || buildDeadheadHome(driver, miles, homeLabel, locationDisplay)
  }, [nearbyLoads, driver, stayLoad?.id, homeMiles, homeLabel, locationDisplay])

  useEffect(() => {
    if (!driver || nearbyLoads.length === 0 || !stayLoad || !homeLoad || stayLoad.id === homeLoad.id) return
    let cancelled = false
    setReasoning("Evaluating nearby loads...")
    fetchWhatsNextRecommendation(driver, nearbyLoads, {
      distanceFromHomeMiles: homeMiles ?? null,
      stayLoad,
      homeLoad,
    })
      .then((ai) => {
        if (cancelled) return
        setRecommended(ai?.recommendation === "HOME" ? "HOME" : "STAY")
        setReasoning(ai?.reasoning || "Recommendation ready.")
      })
      .catch(() => {
        if (cancelled) return
        const topByRate = [...nearbyLoads].sort((a, b) => b.ratePerMile - a.ratePerMile)[0]
        setRecommended(topByRate ? "STAY" : "HOME")
        setReasoning(
          `Based on ${nearbyLoads.length} open loads. Best rate: $${topByRate?.ratePerMile.toFixed(2)}/mi.`
        )
      })
    return () => {
      cancelled = true
    }
  }, [driver, nearbyLoads, stayLoad, homeLoad, homeMiles])

  const cycleRemaining = useMemo(
    () => (driver ? Math.max(0, HOS_RULES.maxCycleHours - driver.hosCycleUsed) : 0),
    [driver]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-2xl bg-card border border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <MapPin className="h-5 w-5 text-primary" />
              {gpsStatus === "live" && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{locationDisplay}</p>
              <p className="text-xs text-muted-foreground">
                Home: {homeLabel}
                {homeMiles != null ? ` (${homeMiles} mi)` : !homePosition ? " — Set home to see distance" : " — Allow location"}
                {gpsStatus === "live" && (
                  <span className="ml-1 text-success font-medium">
                    <Navigation className="inline h-3 w-3 mr-0.5" />GPS live
                  </span>
                )}
                {savedHome && (
                  <>
                    <span className="mx-1.5 text-border">·</span>
                    <button
                      type="button"
                      onClick={clearHome}
                      className="text-primary font-medium hover:underline"
                    >
                      Clear home
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-success" />
              <span className="text-sm font-bold text-success tabular-nums">
                {driver?.hosRemainingHours ?? 0}h drive
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{cycleRemaining.toFixed(0)}h cycle left</span>
          </div>
        </div>

        {!savedHome && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-3">
            <span className="text-xs font-semibold text-muted-foreground">Home</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={setHomeToCurrentLocation}
                disabled={!gpsPos || gpsStatus !== "live"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Crosshair className="h-3.5 w-3.5" />
                Use current location as home
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={homeInput}
                onChange={(e) => {
                  setHomeInput(e.target.value)
                  setHomeInputError(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && void setHomeFromCityState()}
                placeholder="e.g. Manteca, CA"
                className="flex-1 min-w-[140px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => void setHomeFromCityState()}
                disabled={homeInputLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                {homeInputLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Set as home
              </button>
            </div>
            {homeInputError && (
              <p className="text-xs text-destructive">{homeInputError}</p>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {gpsStatus === "acquiring" ? "Acquiring GPS and searching for loads..." : "Loading nearby loads..."}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {!loading && nearbyLoads.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No open loads found{gpsPos ? " near your location" : ""}. Submit a load from the shipper portal or check back soon.
        </div>
      )}

      {stayLoad && homeLoad && stayLoad.id !== homeLoad.id && (
        <>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setChoice("STAY")}
              className={cn(
                "w-full text-left rounded-2xl border-2 transition-colors p-5 min-h-[56px]",
                choice === "STAY"
                  ? "border-success bg-success/10"
                  : recommended === "STAY" && !choice
                  ? "border-success/50 bg-success/5"
                  : "border-border bg-card hover:bg-secondary/50"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", recommended === "STAY" ? "bg-success/20" : "bg-secondary")}>
                    <Truck className={cn("h-6 w-6", recommended === "STAY" ? "text-success" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">STAY</p>
                    <p className="text-xs text-muted-foreground">Keep earning on the road</p>
                  </div>
                </div>
                {recommended === "STAY" && !choice && (
                  <span className="rounded-lg bg-success/20 text-success text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                    Best move
                  </span>
                )}
                {choice === "STAY" && <CheckCircle2 className="h-6 w-6 text-success" />}
              </div>
              <LoadPreview load={stayLoad} />
            </button>

            <button
              onClick={() => setChoice("HOME")}
              className={cn(
                "w-full text-left rounded-2xl border-2 transition-colors p-5 min-h-[56px]",
                choice === "HOME" ? "border-success bg-success/10" : "border-border bg-card hover:bg-secondary/50"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                    <Home className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">HOME</p>
                    <p className="text-xs text-muted-foreground">Head toward {homeLabel}</p>
                  </div>
                </div>
                {choice === "HOME" && <CheckCircle2 className="h-6 w-6 text-success" />}
              </div>
              <LoadPreview load={homeLoad} />
            </button>
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">
              Why {recommended}?
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{reasoning}</p>
          </div>

          {choice && (
            <div className="rounded-2xl bg-success/10 border-2 border-success/30 p-5">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle2 className="h-6 w-6 text-success" />
                <p className="text-base font-bold text-foreground">
                  {choice === "HOME"
                    ? `Heading home via ${homeLoad.destination}`
                    : `Staying on - ${stayLoad.origin} to ${stayLoad.destination}`}
                </p>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {choice === "HOME"
                  ? `Pickup at ${homeLoad.pickupTime}. ${homeLoad.miles} mi, $${(homeLoad.rateCents / 100).toLocaleString()} ($${homeLoad.ratePerMile.toFixed(2)}/mi).`
                  : `Pickup at ${stayLoad.pickupTime}. ${stayLoad.miles} mi, $${(stayLoad.rateCents / 100).toLocaleString()} ($${stayLoad.ratePerMile.toFixed(2)}/mi).`}
              </p>
              <button className="w-full rounded-xl bg-success text-success-foreground font-bold text-sm px-5 py-3 min-h-[44px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                <ArrowRight className="h-4 w-4" />
                Continue
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LoadPreview({ load }: { load: NearbyLoad }) {
  return (
    <div className="rounded-xl bg-background/50 border border-border p-4 mb-2">
      <p className="text-sm font-bold text-foreground mb-1">
        {load.origin} <span className="text-muted-foreground font-normal mx-1">&gt;</span> {load.destination}
      </p>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm text-foreground font-bold tabular-nums">{load.miles} mi</span>
        <span className="text-sm text-success font-bold tabular-nums">${(load.rateCents / 100).toLocaleString()}</span>
        <span className="text-sm text-primary font-bold tabular-nums">${load.ratePerMile.toFixed(2)}/mi</span>
        <span className="text-xs text-muted-foreground ml-auto">{load.pickupTime}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Package className="h-2.5 w-2.5" />
        <span>{load.commodity}</span>
        <span className="text-border">|</span>
        <span>{(load.weight / 1000).toFixed(1)}k lbs</span>
        <span className="text-border">|</span>
        <span>{load.broker}</span>
      </div>
    </div>
  )
}
