"use client"

import { useEffect, useMemo, useState } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { type Driver, HOS_RULES, type NearbyLoad } from "@/lib/mock-data"
import {
  fetchDrivers,
  fetchLegs,
  fetchWhatsNextRecommendation,
  legsToNearbyLoads,
} from "@/lib/backend-api"

function pickHomeLoad(nearbyLoads: NearbyLoad[], driver: Driver | null) {
  if (!driver || nearbyLoads.length === 0) return nearbyLoads[0] || null
  const homeState = driver.homeCity.split(",").pop()?.trim().toUpperCase() || ""
  return (
    nearbyLoads.find((load) => load.destinationState === homeState) ||
    nearbyLoads.find((load) => load.originState === homeState) ||
    nearbyLoads[0]
  )
}

export default function WhatsNextPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [nearbyLoads, setNearbyLoads] = useState<NearbyLoad[]>([])
  const [recommended, setRecommended] = useState<"HOME" | "STAY">("STAY")
  const [reasoning, setReasoning] = useState("Evaluating nearby loads...")
  const [choice, setChoice] = useState<"HOME" | "STAY" | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const drivers = await fetchDrivers()
        const selectedDriver = drivers[0] || null
        setDriver(selectedDriver)

        const openLegs = await fetchLegs({ status: "OPEN" })
        const loads = legsToNearbyLoads(openLegs).slice(0, 4)
        setNearbyLoads(loads)

        if (selectedDriver && loads.length > 0) {
          try {
            const ai = await fetchWhatsNextRecommendation(selectedDriver, loads)
            const recommendation = ai?.recommendation === "HOME" ? "HOME" : "STAY"
            setRecommended(recommendation)
            setReasoning(ai?.reasoning || "AI recommendation available.")
          } catch {
            const topByRate = [...loads].sort((a, b) => b.ratePerMile - a.ratePerMile)[0]
            const fallback = topByRate ? "STAY" : "HOME"
            setRecommended(fallback)
            setReasoning("AI unavailable, using rate-based fallback recommendation.")
          }
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load recommendation data"
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const stayLoad = useMemo(() => nearbyLoads[0] || null, [nearbyLoads])
  const homeLoad = useMemo(() => pickHomeLoad(nearbyLoads, driver), [nearbyLoads, driver])
  const cycleRemaining = useMemo(
    () => (driver ? Math.max(0, HOS_RULES.maxCycleHours - driver.hosCycleUsed) : 0),
    [driver]
  )
  const homeMiles = useMemo(() => Math.max(80, Math.round((driver?.hosRemainingHours || 6) * 45)), [driver])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-2xl bg-card border border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{driver?.currentCity || "Current location"}</p>
            <p className="text-xs text-muted-foreground">
              Home: {driver?.homeCity || "Home Base"} ({homeMiles} mi) &middot;{" "}
              {driver ? `${driver.trailerType} ${driver.trailerLength}` : "Trailer unknown"}
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

      {loading && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading nearby loads and recommendation...
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
          No open loads available yet. Submit a load in the shipper portal first.
        </div>
      )}

      {stayLoad && homeLoad && (
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
                  : "border-border bg-card active:bg-secondary"
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
                choice === "HOME" ? "border-success bg-success/10" : "border-border bg-card active:bg-secondary"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                    <Home className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">HOME</p>
                    <p className="text-xs text-muted-foreground">Head toward {driver?.homeCity || "home"}</p>
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
        {load.origin} <span className="text-muted-foreground font-normal mx-1">{">"}</span> {load.destination}
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
