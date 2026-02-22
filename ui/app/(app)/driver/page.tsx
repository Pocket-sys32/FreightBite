"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  PlayCircle,
  SlidersHorizontal,
  Wifi,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LegCard } from "@/components/leg-card"
import { cn } from "@/lib/utils"
import { type Driver, HOS_RULES, type Leg } from "@/lib/mock-data"
import {
  acceptLeg,
  arriveAtLegStop,
  fetchCurrentDriver,
  fetchLegDirections,
  fetchLegWorkflow,
  fetchLegs,
  finishLegHandoff,
  startLegRoute,
  type LegDirections,
  type LegWorkflow,
} from "@/lib/backend-api"

function hosColor(hours: number) {
  if (hours >= 8) return "text-success"
  if (hours >= 5) return "text-warning"
  return "text-destructive"
}

function hosBg(hours: number) {
  if (hours >= 8) return "bg-success"
  if (hours >= 5) return "bg-warning"
  return "bg-destructive"
}

function hosBarPct(hours: number) {
  return Math.min((hours / HOS_RULES.maxDrivingHours) * 100, 100)
}

function cycleBarPct(usedHours: number) {
  return Math.min((usedHours / HOS_RULES.maxCycleHours) * 100, 100)
}

function phaseLabel(phase: string | undefined) {
  switch ((phase || "").toUpperCase()) {
    case "ASSIGNED":
      return "Assigned"
    case "START_ROUTE":
      return "Route Started"
    case "ARRIVED":
      return "Arrived"
    case "HANDOFF_READY":
      return "Handoff Ready"
    case "HANDOFF_COMPLETE":
      return "Handoff Complete"
    case "AUTO_START_ROUTE":
      return "Auto-Started"
    case "OPEN":
      return "Open"
    default:
      return "Pending"
  }
}

function nextLegAction(leg: Leg, workflow?: LegWorkflow): "START_ROUTE" | "ARRIVE" | "HANDOFF" | null {
  if (leg.status !== "IN_TRANSIT") return null
  const phase = (workflow?.phase || "").toUpperCase()

  if (phase === "ARRIVED") return "HANDOFF"
  if (phase === "START_ROUTE") return "ARRIVE"
  if (phase === "HANDOFF_COMPLETE") return null
  return "START_ROUTE"
}

function actionLabel(action: "START_ROUTE" | "ARRIVE" | "HANDOFF") {
  if (action === "START_ROUTE") return "Start Route"
  if (action === "ARRIVE") return "Mark Arrived"
  return "Finish Handoff"
}

function fmtLatLng(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export default function DriverDashboardPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [openLegs, setOpenLegs] = useState<Leg[]>([])
  const [myLegs, setMyLegs] = useState<Leg[]>([])
  const [workflowByLeg, setWorkflowByLeg] = useState<Record<string, LegWorkflow>>({})
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)
  const [directions, setDirections] = useState<LegDirections | null>(null)
  const [filter, setFilter] = useState<"all" | "nearby" | "high-pay">("all")
  const [loading, setLoading] = useState(true)
  const [loadingDirections, setLoadingDirections] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [confirmHandoffLegId, setConfirmHandoffLegId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadBoard = useCallback(
    async (focusLegId?: string) => {
      setLoading(true)
      setError(null)

      try {
        const currentDriver = await fetchCurrentDriver()
        if (!currentDriver) {
          setError("Authentication required")
          return
        }

        const [availableLegs, claimedLegs] = await Promise.all([
          fetchLegs({ status: "OPEN" }),
          fetchLegs({ driverId: currentDriver.id }),
        ])

        const sortedClaimed = [...claimedLegs].sort((a, b) => a.sequence - b.sequence)
        const workflowEntries = await Promise.all(
          sortedClaimed.map(async (leg) => {
            try {
              const workflow = await fetchLegWorkflow(leg.id)
              return [leg.id, workflow] as const
            } catch {
              return [leg.id, null] as const
            }
          })
        )

        const nextWorkflowByLeg: Record<string, LegWorkflow> = {}
        for (const [legId, workflow] of workflowEntries) {
          if (workflow) nextWorkflowByLeg[legId] = workflow
        }

        setDriver(currentDriver)
        setOpenLegs(availableLegs)
        setMyLegs(sortedClaimed)
        setWorkflowByLeg(nextWorkflowByLeg)

        setSelectedLegId((previous) => {
          if (focusLegId && sortedClaimed.some((leg) => leg.id === focusLegId)) return focusLegId
          if (previous && sortedClaimed.some((leg) => leg.id === previous)) return previous
          const activeLeg = sortedClaimed.find((leg) => leg.status === "IN_TRANSIT")
          return activeLeg?.id || sortedClaimed[0]?.id || null
        })
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load driver board"
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  useEffect(() => {
    let active = true

    const loadDirections = async () => {
      if (!driver || !selectedLegId) {
        setDirections(null)
        return
      }

      setLoadingDirections(true)
      try {
        const nextDirections = await fetchLegDirections(selectedLegId, driver.id)
        if (!active) return
        setDirections(nextDirections)
      } catch (directionsError) {
        if (!active) return
        const message = directionsError instanceof Error ? directionsError.message : "Failed to load directions"
        setError(message)
        setDirections(null)
      } finally {
        if (active) setLoadingDirections(false)
      }
    }

    void loadDirections()

    return () => {
      active = false
    }
  }, [driver, selectedLegId])

  const handleAccept = useCallback(
    async (leg: Leg) => {
      if (!driver) return
      setActionKey(`accept-${leg.id}`)
      setError(null)

      try {
        await acceptLeg(leg.id, driver.id)
        setNotice(`Leg ${leg.sequence} accepted and linked to your route queue.`)
        await loadBoard(leg.id)
      } catch (acceptError) {
        const message = acceptError instanceof Error ? acceptError.message : "Failed to accept leg"
        setError(message)
      } finally {
        setActionKey(null)
      }
    },
    [driver, loadBoard]
  )

  const handleLegAction = useCallback(
    async (leg: Leg) => {
      if (!driver) return

      const workflow = workflowByLeg[leg.id]
      const action = nextLegAction(leg, workflow)
      if (!action) return

      if (action === "HANDOFF") {
        if (confirmHandoffLegId !== leg.id) {
          setConfirmHandoffLegId(leg.id)
          return
        }
        setConfirmHandoffLegId(null)
      }

      setActionKey(`${action}-${leg.id}`)
      setError(null)

      try {
        if (action === "START_ROUTE") {
          await startLegRoute(leg.id, driver.id)
          setNotice(`Route started for leg ${leg.sequence}.`)
          await loadBoard(leg.id)
        } else if (action === "ARRIVE") {
          await arriveAtLegStop(leg.id, driver.id)
          setNotice(`Arrival confirmed for leg ${leg.sequence}.`)
          await loadBoard(leg.id)
        } else {
          const completed = await finishLegHandoff(leg.id, driver.id)
          const nextLegId = completed.autoStartedNextLeg?.id || workflow?.nextLeg?.id || null
          setNotice(nextLegId ? "Handoff completed and next connected leg is now active." : "Handoff completed.")
          await loadBoard(nextLegId || undefined)
        }
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Failed to update leg status"
        setError(message)
      } finally {
        setActionKey(null)
      }
    },
    [confirmHandoffLegId, driver, loadBoard, workflowByLeg]
  )

  const filteredOpenLegs = useMemo(
    () =>
      openLegs.filter((leg) => {
        if (filter === "nearby") return leg.miles < 400
        if (filter === "high-pay") return leg.ratePerMile >= 1.9
        return true
      }),
    [filter, openLegs]
  )

  const selectedLeg = myLegs.find((leg) => leg.id === selectedLegId) || null
  const selectedWorkflow = selectedLeg ? workflowByLeg[selectedLeg.id] : undefined

  const cycleRemaining = driver ? Math.max(0, HOS_RULES.maxCycleHours - driver.hosCycleUsed) : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Hours of Service</span>
          <span className={`text-xs font-bold uppercase tracking-widest ${hosColor(driver?.hosRemainingHours || 0)}`}>
            {(driver?.hosRemainingHours || 0) >= 8 ? "Good" : (driver?.hosRemainingHours || 0) >= 5 ? "Limited" : "Critical"}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-5xl font-bold tabular-nums tracking-tight ${hosColor(driver?.hosRemainingHours || 0)}`}>
            {driver?.hosRemainingHours ?? 0}
          </span>
          <span className="text-lg text-muted-foreground font-medium">of {HOS_RULES.maxDrivingHours} hrs drive time</span>
        </div>

        <div className="relative h-3 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${hosBg(driver?.hosRemainingHours || 0)}`} style={{ width: `${hosBarPct(driver?.hosRemainingHours || 0)}%` }} />
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">70-hr / 8-day cycle</span>
          <span className="text-xs text-muted-foreground tabular-nums">{cycleRemaining.toFixed(1)} hrs remaining</span>
        </div>

        <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${cycleBarPct(driver?.hosCycleUsed || 0)}%` }} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{driver?.currentCity || "No driver loaded"}</span>
          <span className="text-border">|</span>
          <span>{driver?.trailerType || "Trailer"} {driver?.trailerLength || ""}</span>
          <span className="text-border">|</span>
          <span className="font-mono">{driver?.mcNumber || "--"}</span>
          <span className="text-border">|</span>
          <span>{myLegs.length} connected legs</span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1">
        <Wifi className="h-3 w-3 text-success" />
        <span className="text-[10px] text-muted-foreground">
          {loading
            ? "Syncing route state..."
            : `Synced live board · ${myLegs.length} mine · ${openLegs.length} open`}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{notice}</span>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">My Connected Legs</h2>
            <p className="text-xs text-muted-foreground">Leg handoffs are linked as a chain and update the next driver automatically.</p>
          </div>
        </div>

        {myLegs.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">You do not have any assigned legs yet. Claim an open leg below.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myLegs.map((leg) => {
              const workflow = workflowByLeg[leg.id]
              const action = nextLegAction(leg, workflow)
              const isBusy = action ? actionKey === `${action}-${leg.id}` : false
              const handoff = workflow?.handoffs[0]

              return (
                <div
                  key={leg.id}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    selectedLegId === leg.id ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-foreground">
                      Leg {leg.sequence}: {leg.origin} {">"} {leg.destination}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {leg.status.replace("_", " ")}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {phaseLabel(workflow?.phase)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-foreground">Exact handoff:</span> {leg.handoffAddress}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Previous / Next:</span>{" "}
                      {workflow?.previousLeg ? `Leg ${workflow.previousLeg.sequence}` : "Start"}
                      {" / "}
                      {workflow?.nextLeg ? `Leg ${workflow.nextLeg.sequence}` : "Final"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Route window:</span> {leg.estimatedPickup} to {leg.estimatedDelivery}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Handoff handshake:</span>{" "}
                      {handoff ? `${handoff.status} (${handoff.fromLegId.slice(0, 6)} -> ${handoff.toLegId.slice(0, 6)})` : "Not linked yet"}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-col gap-1 text-sm text-foreground">
                    <p>
                      <span className="font-medium">Pickup:</span> {leg.originAddress}
                    </p>
                    <p>
                      <span className="font-medium">Drop-off:</span> {leg.destinationAddress}
                    </p>
                  </div>

                  {confirmHandoffLegId === leg.id && (
                    <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                      Complete handoff for this leg? The next driver will be notified. Tap again to confirm.
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedLegId(leg.id)}>
                      <MapPin className="h-4 w-4" />
                      View Map
                    </Button>

                    {action && (
                      <Button
                        size="sm"
                        onClick={() => void handleLegAction(leg)}
                        disabled={isBusy}
                        variant={confirmHandoffLegId === leg.id ? "destructive" : "default"}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                        {confirmHandoffLegId === leg.id ? "Confirm Handoff" : actionLabel(action)}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {selectedLeg && (
        <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Directions to Next Location</h2>
              <p className="text-xs text-muted-foreground">
                Leg {selectedLeg.sequence} · {selectedLeg.origin} {">"} {selectedLeg.destination}
              </p>
            </div>
            {directions && (
              <a
                className="text-xs text-primary font-semibold"
                href={`https://www.google.com/maps/dir/?api=1&origin=${directions.from.lat},${directions.from.lng}&destination=${directions.to.lat},${directions.to.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Maps
              </a>
            )}
          </div>

          {loadingDirections ? (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading route geometry and turn-by-turn directions...
            </div>
          ) : directions ? (
            <>
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <DirectionsMap points={directions.directions.geometry} />
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-foreground">From:</span> {directions.from.label} ({fmtLatLng(directions.from.lat, directions.from.lng)})
                </p>
                <p>
                  <span className="font-semibold text-foreground">To:</span> {directions.to.label} ({fmtLatLng(directions.to.lat, directions.to.lng)})
                </p>
                <p>
                  <span className="font-semibold text-foreground">Distance:</span> {directions.directions.distanceMiles.toFixed(1)} mi
                </p>
                <p>
                  <span className="font-semibold text-foreground">ETA:</span> {directions.directions.durationMinutes.toFixed(0)} min
                </p>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-secondary/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Turn-by-Turn
                </div>
                <ol className="divide-y divide-border">
                  {directions.directions.steps.slice(0, 8).map((step, index) => (
                    <li key={`${step.instruction}-${index}`} className="px-4 py-3 text-sm text-foreground flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <p>{step.instruction}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {step.distanceMiles.toFixed(1)} mi · {step.durationMinutes.toFixed(0)} min
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No map/directions available for this leg yet.</p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Open Legs Board</h2>
          <span className="text-sm text-muted-foreground">{filteredOpenLegs.length} legs</span>
        </div>

        <div className="flex items-center gap-2">
          {(["all", "nearby", "high-pay"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setFilter(option)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium min-h-[44px] transition-colors ${
                filter === option ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground active:bg-border"
              }`}
            >
              {option === "high-pay" ? "$1.90+/mi" : option === "all" ? "All" : "<400 mi"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {filteredOpenLegs.map((leg) => (
            <LegCard
              key={leg.id}
              leg={leg}
              accepting={actionKey === `accept-${leg.id}`}
              onAccept={handleAccept}
            />
          ))}
        </div>

        {!loading && filteredOpenLegs.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 gap-4">
            <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {openLegs.length === 0 ? "No open legs on the board yet" : "No legs match this filter"}
            </p>
            <Button variant="outline" className="rounded-lg min-h-[44px]" onClick={() => setFilter("all")}>
              Show All
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function DirectionsMap({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const path = useMemo(() => {
    if (points.length < 2) return null

    const lats = points.map((point) => point.lat)
    const lngs = points.map((point) => point.lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const width = 100
    const height = 60
    const pad = 6

    const latRange = Math.max(maxLat - minLat, 0.0001)
    const lngRange = Math.max(maxLng - minLng, 0.0001)

    const normalized = points.map((point) => {
      const x = pad + ((point.lng - minLng) / lngRange) * (width - pad * 2)
      const y = height - (pad + ((point.lat - minLat) / latRange) * (height - pad * 2))
      return { x, y }
    })

    const d = normalized.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")

    return {
      d,
      start: normalized[0],
      end: normalized[normalized.length - 1],
    }
  }, [points])

  if (!path) {
    return (
      <div className="h-56 rounded-lg bg-secondary/50 flex items-center justify-center text-sm text-muted-foreground">
        Route geometry unavailable.
      </div>
    )
  }

  return (
    <div className="relative">
      <svg viewBox="0 0 100 60" className="w-full h-auto" style={{ minHeight: "220px" }}>
        <rect x="0" y="0" width="100" height="60" fill="oklch(0.98 0.01 85)" />
        {Array.from({ length: 7 }, (_, index) => (
          <line
            key={`grid-h-${index}`}
            x1="0"
            x2="100"
            y1={(60 / 6) * index}
            y2={(60 / 6) * index}
            stroke="oklch(0.88 0.01 75 / 0.45)"
            strokeWidth="0.2"
          />
        ))}
        {Array.from({ length: 11 }, (_, index) => (
          <line
            key={`grid-v-${index}`}
            y1="0"
            y2="60"
            x1={(100 / 10) * index}
            x2={(100 / 10) * index}
            stroke="oklch(0.88 0.01 75 / 0.45)"
            strokeWidth="0.2"
          />
        ))}

        <path d={path.d} fill="none" stroke="oklch(0.57 0.19 258)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={path.start.x} cy={path.start.y} r="1.7" fill="oklch(0.63 0.15 145)" />
        <circle cx={path.end.x} cy={path.end.y} r="1.9" fill="oklch(0.65 0.22 35)" />
      </svg>
      <div className="absolute right-3 top-3 rounded-lg bg-card/90 border border-border px-2 py-1 text-[10px] text-muted-foreground inline-flex items-center gap-1">
        <Navigation className="h-3 w-3" />
        Live route preview
      </div>
    </div>
  )
}
