"use client"

import { useState, useEffect } from "react"
import { SlidersHorizontal, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LegCard } from "@/components/leg-card"
import { DEMO_DRIVERS, HOS_RULES } from "@/lib/mock-data"
import { getLegs, getDrivers, acceptLeg } from "@/lib/api"
import { apiLegToLeg } from "@/lib/adapters"
import type { Leg } from "@/lib/mock-data"

const driver = DEMO_DRIVERS[0]

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

  const filteredLegs = AVAILABLE_LEGS.filter((leg) => {
    if (filter === "nearby") return leg.miles < 400
    if (filter === "high-pay") return leg.ratePerMile >= 1.90
    return true
  })

  const cycleRemaining = HOS_RULES.maxCycleHours - driver.hosCycleUsed

  return (
    <div className="flex flex-col gap-6">
      {/* HOS Banner */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Hours of Service
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground font-mono">
              ELD: {driver.eldProvider}
            </span>
            <span className={`text-xs font-bold uppercase tracking-widest ${hosColor(driver.hosRemainingHours)}`}>
              {driver.hosRemainingHours >= 8 ? "Good" : driver.hosRemainingHours >= 5 ? "Limited" : "Critical"}
            </span>
          </div>
        </div>

        {/* Drive time */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-5xl font-bold tabular-nums tracking-tight ${hosColor(driver.hosRemainingHours)}`}>
            {driver.hosRemainingHours}
          </span>
          <span className="text-lg text-muted-foreground font-medium">
            of {HOS_RULES.maxDrivingHours} hrs drive time
          </span>
        </div>
        <div className="relative h-3 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${hosBg(driver.hosRemainingHours)}`}
            style={{ width: `${hosBarPct(driver.hosRemainingHours)}%` }}
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
            style={{ width: `${cycleBarPct(driver.hosCycleUsed)}%` }}
          />
        </div>

        {/* Driver info strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{driver.currentCity}</span>
          <span className="text-border">|</span>
          <span>{driver.trailerType} {driver.trailerLength}</span>
          <span className="text-border">|</span>
          <span className="font-mono">{driver.mcNumber}</span>
          <span className="text-border">|</span>
          <span>{driver.totalLoads} loads</span>
        </div>
      </div>

      {/* Sync status (offline-tolerant) */}
      <div className="flex items-center gap-2 px-1">
        <Wifi className="h-3 w-3 text-success" />
        <span className="text-[10px] text-muted-foreground">
          Synced 2 min ago &middot; {AVAILABLE_LEGS.length} loads on board
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
          <LegCard key={leg.id} leg={leg} />
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
