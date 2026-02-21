"use client"

import { useState, useEffect } from "react"
import { SlidersHorizontal, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LegCard } from "@/components/leg-card"
import { DEMO_DRIVERS, HOS_RULES } from "@/lib/mock-data"
import { getLegs, getDrivers, acceptLeg, type UILeg, type ApiDriver } from "@/lib/api"

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
  const [filter, setFilter] = useState<"all" | "nearby" | "high-pay">("all")
  const [openLegs, setOpenLegs] = useState<UILeg[]>([])
  const [drivers, setDrivers] = useState<ApiDriver[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  const driver = selectedDriverId
    ? drivers.find((d) => d.id === selectedDriverId)
    : drivers[0]
  const fallbackDriver = DEMO_DRIVERS[0]
  const displayDriver = driver ?? fallbackDriver

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [legs, drs] = await Promise.all([getLegs("OPEN"), getDrivers()])
        if (!cancelled) {
          setOpenLegs(legs)
          setDrivers(drs)
          if (drs.length > 0 && !selectedDriverId) setSelectedDriverId(drs[0].id)
        }
      } catch {
        if (!cancelled) setOpenLegs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filteredLegs = openLegs.filter((leg) => {
    if (filter === "nearby") return leg.miles < 400
    if (filter === "high-pay") return leg.ratePerMile >= 1.90
    return true
  })

  const cycleRemaining = HOS_RULES.maxCycleHours - (displayDriver.hosCycleUsed ?? 0)
  const handleAccept = async (legId: string) => {
    if (!selectedDriverId) return
    setAcceptingId(legId)
    try {
      await acceptLeg(legId, selectedDriverId)
      setOpenLegs((prev) => prev.filter((l) => l.id !== legId))
    } finally {
      setAcceptingId(null)
    }
  }

  const hosHours = displayDriver.hosRemainingHours ?? fallbackDriver.hosRemainingHours
  const hosUsed = displayDriver.hosCycleUsed ?? fallbackDriver.hosCycleUsed

  return (
    <div className="flex flex-col gap-6">
      {/* Driver selector */}
      {drivers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">View as driver</label>
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
          >
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.email})</option>
            ))}
          </select>
        </div>
      )}

      {/* HOS Banner */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Hours of Service
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground font-mono">
              ELD: {fallbackDriver.eldProvider}
            </span>
            <span className={`text-xs font-bold uppercase tracking-widest ${hosColor(hosHours)}`}>
              {hosHours >= 8 ? "Good" : hosHours >= 5 ? "Limited" : "Critical"}
            </span>
          </div>
        </div>

        {/* Drive time */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-5xl font-bold tabular-nums tracking-tight ${hosColor(hosHours)}`}>
            {hosHours}
          </span>
          <span className="text-lg text-muted-foreground font-medium">
            of {HOS_RULES.maxDrivingHours} hrs drive time
          </span>
        </div>
        <div className="relative h-3 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${hosBg(hosHours)}`}
            style={{ width: `${hosBarPct(hosHours)}%` }}
          />
        </div>

        {/* 70-hr cycle */}
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
            style={{ width: `${cycleBarPct(hosUsed)}%` }}
          />
        </div>

        {/* Driver info strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{displayDriver.name}</span>
          <span className="text-border">|</span>
          <span>{displayDriver.email}</span>
        </div>
      </div>

      {/* Sync status */}
      <div className="flex items-center gap-2 px-1">
        <Wifi className="h-3 w-3 text-success" />
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Loading..." : `${openLegs.length} open legs on board`}
        </span>
      </div>

      {/* Filter bar */}
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
        <span className="text-sm text-muted-foreground">
          {filteredLegs.length} legs
        </span>
      </div>

      {/* Legs list */}
      <div className="flex flex-col gap-4">
        {filteredLegs.map((leg) => (
          <LegCard
            key={leg.id}
            leg={leg}
            onAccept={selectedDriverId ? () => handleAccept(leg.id) : undefined}
            acceptLoading={acceptingId === leg.id}
          />
        ))}
      </div>

      {filteredLegs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 gap-4">
          <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No legs match this filter</p>
          <Button
            variant="outline"
            className="rounded-lg min-h-[44px]"
            onClick={() => setFilter("all")}
          >
            Show All
          </Button>
        </div>
      )}
    </div>
  )
}
