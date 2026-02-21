"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, SlidersHorizontal, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LegCard } from "@/components/leg-card"
import { type Driver, HOS_RULES, type Leg } from "@/lib/mock-data"
import { acceptLeg, fetchDrivers, fetchLegs } from "@/lib/backend-api"

function hosColor(h: number) {
  if (h >= 8) return "text-success"
  if (h >= 5) return "text-warning"
  return "text-destructive"
}

function hosBg(h: number) {
  if (h >= 8) return "bg-success"
  if (h >= 5) return "bg-warning"
  return "bg-destructive"
}

function hosBarPct(h: number) {
  return Math.min((h / HOS_RULES.maxDrivingHours) * 100, 100)
}

function cycleBarPct(used: number) {
  return Math.min((used / HOS_RULES.maxCycleHours) * 100, 100)
}

export default function DriverDashboardPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [legs, setLegs] = useState<Leg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acceptingLegId, setAcceptingLegId] = useState<string | null>(null)
  const [lastAcceptedLegId, setLastAcceptedLegId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "nearby" | "high-pay">("all")

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [drivers, openLegs] = await Promise.all([
        fetchDrivers(),
        fetchLegs({ status: "OPEN" }),
      ])

      setDriver(drivers[0] || null)
      setLegs(openLegs)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load driver board"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAccept = useCallback(
    async (leg: Leg) => {
      if (!driver) return
      setAcceptingLegId(leg.id)
      setError(null)
      try {
        await acceptLeg(leg.id, driver.id)
        setLastAcceptedLegId(leg.id)
        await loadData()
      } catch (acceptError) {
        const message = acceptError instanceof Error ? acceptError.message : "Failed to accept leg"
        setError(message)
      } finally {
        setAcceptingLegId(null)
      }
    },
    [driver, loadData]
  )

  const filteredLegs = useMemo(
    () =>
      legs.filter((leg) => {
        if (filter === "nearby") return leg.miles < 400
        if (filter === "high-pay") return leg.ratePerMile >= 1.9
        return true
      }),
    [filter, legs]
  )

  const cycleRemaining = driver ? Math.max(0, HOS_RULES.maxCycleHours - driver.hosCycleUsed) : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Hours of Service
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground font-mono">
              ELD: {driver?.eldProvider || "Unknown"}
            </span>
            <span className={`text-xs font-bold uppercase tracking-widest ${hosColor(driver?.hosRemainingHours || 0)}`}>
              {(driver?.hosRemainingHours || 0) >= 8
                ? "Good"
                : (driver?.hosRemainingHours || 0) >= 5
                ? "Limited"
                : "Critical"}
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-5xl font-bold tabular-nums tracking-tight ${hosColor(driver?.hosRemainingHours || 0)}`}>
            {driver?.hosRemainingHours ?? 0}
          </span>
          <span className="text-lg text-muted-foreground font-medium">
            of {HOS_RULES.maxDrivingHours} hrs drive time
          </span>
        </div>
        <div className="relative h-3 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${hosBg(driver?.hosRemainingHours || 0)}`}
            style={{ width: `${hosBarPct(driver?.hosRemainingHours || 0)}%` }}
          />
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            70-hr / 8-day cycle
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {cycleRemaining.toFixed(1)} hrs remaining
          </span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-500"
            style={{ width: `${cycleBarPct(driver?.hosCycleUsed || 0)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{driver?.currentCity || "No driver loaded"}</span>
          <span className="text-border">|</span>
          <span>
            {driver?.trailerType || "Trailer"} {driver?.trailerLength || ""}
          </span>
          <span className="text-border">|</span>
          <span className="font-mono">{driver?.mcNumber || "--"}</span>
          <span className="text-border">|</span>
          <span>{driver?.totalLoads || 0} loads</span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1">
        <Wifi className="h-3 w-3 text-success" />
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Syncing..." : `Synced live board · ${legs.length} open legs`}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {lastAcceptedLegId && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
          Leg accepted successfully. It is now marked <span className="font-semibold">IN_TRANSIT</span>.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["all", "nearby", "high-pay"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium min-h-[44px] transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground active:bg-border"
              }`}
            >
              {f === "high-pay" ? "$1.90+/mi" : f === "all" ? "All" : "<400 mi"}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{filteredLegs.length} legs</span>
      </div>

      <div className="flex flex-col gap-4">
        {filteredLegs.map((leg) => (
          <LegCard
            key={leg.id}
            leg={leg}
            accepting={acceptingLegId === leg.id}
            onAccept={handleAccept}
          />
        ))}
      </div>

      {!loading && filteredLegs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 gap-4">
          <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {legs.length === 0 ? "No open legs on the board yet" : "No legs match this filter"}
          </p>
          <Button variant="outline" className="rounded-lg min-h-[44px]" onClick={() => setFilter("all")}>
            Show All
          </Button>
        </div>
      )}
    </div>
  )
}
