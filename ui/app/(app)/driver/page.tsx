"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  PlayCircle,
  SlidersHorizontal,
  Wifi,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DriverMap } from "@/components/driver-map"
import { LegRouteDirections } from "@/components/leg-route-directions"
import { LegCard } from "@/components/leg-card"
import { cn } from "@/lib/utils"
import { type Driver, HOS_RULES, type Leg } from "@/lib/mock-data"
import {
  acceptLeg,
  arriveAtLegStop,
  fetchCurrentDriver,
  fetchLegWorkflow,
  fetchLegs,
  finishLegHandoff,
  pauseLegRoute,
  resumeLegRoute,
  startLegRoute,
  updateDriverLiveLocation,
  type LegEvent,
  type LegWorkflow,
} from "@/lib/backend-api"

const HANDOFF_COMPLETION_RADIUS_MILES = Number(process.env.NEXT_PUBLIC_HANDOFF_COMPLETION_RADIUS_MILES || 0.25)
const DRIVE_START_EVENTS = new Set(["START_ROUTE", "AUTO_START_ROUTE", "RESUME_ROUTE"])
const DRIVE_STOP_EVENTS = new Set(["PAUSE_ROUTE", "ARRIVED", "HANDOFF_COMPLETE"])
const TEN_HOURS_MS = 10 * 60 * 60 * 1000
const CYCLE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000

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
    case "PAUSE_ROUTE":
      return "Paused"
    case "RESUME_ROUTE":
      return "Resumed"
    case "OPEN":
      return "Open"
    default:
      return "Pending"
  }
}

function legDriveState(leg: Leg, workflow?: LegWorkflow): "DRIVING" | "PAUSED" | "IDLE" {
  if (leg.status !== "IN_TRANSIT") return "IDLE"
  const phase = (workflow?.phase || "").toUpperCase()
  if (phase === "PAUSE_ROUTE") return "PAUSED"
  if (DRIVE_START_EVENTS.has(phase)) return "DRIVING"
  return "IDLE"
}

function intersectWindow(start: number, end: number, windowStart: number, windowEnd: number) {
  const from = Math.max(start, windowStart)
  const to = Math.min(end, windowEnd)
  return Math.max(0, to - from)
}

function computeHosUsage(events: LegEvent[], nowMs: number) {
  const sorted = [...events]
    .filter((event) => !!event.createdAt)
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())

  const intervals: Array<{ start: number; end: number }> = []
  let activeStart: number | null = null

  for (const event of sorted) {
    const ts = new Date(event.createdAt || 0).getTime()
    if (!Number.isFinite(ts)) continue
    if (DRIVE_START_EVENTS.has(event.eventType)) {
      if (activeStart === null) activeStart = ts
      continue
    }
    if (DRIVE_STOP_EVENTS.has(event.eventType)) {
      if (activeStart !== null && ts > activeStart) {
        intervals.push({ start: activeStart, end: ts })
      }
      activeStart = null
    }
  }

  if (activeStart !== null && nowMs > activeStart) {
    intervals.push({ start: activeStart, end: nowMs })
  }

  let cycleMs = 0
  const cycleStart = nowMs - CYCLE_WINDOW_MS
  for (const interval of intervals) {
    cycleMs += intersectWindow(interval.start, interval.end, cycleStart, nowMs)
  }

  let shiftStartIdx = 0
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start - intervals[index - 1].end >= TEN_HOURS_MS) {
      shiftStartIdx = index
    }
  }
  let shiftMs = 0
  for (let index = shiftStartIdx; index < intervals.length; index += 1) {
    shiftMs += Math.max(0, intervals[index].end - intervals[index].start)
  }

  return {
    shiftHours: Number((shiftMs / (60 * 60 * 1000)).toFixed(2)),
    cycleHours: Number((cycleMs / (60 * 60 * 1000)).toFixed(2)),
    activelyDriving: activeStart !== null,
  }
}

function nextLegAction(leg: Leg, workflow?: LegWorkflow): "START_ROUTE" | "ARRIVE" | "HANDOFF" | null {
  if (leg.status !== "IN_TRANSIT") return null
  const phase = (workflow?.phase || "").toUpperCase()

  if (phase === "ARRIVED") return "HANDOFF"
  if (phase === "START_ROUTE" || phase === "AUTO_START_ROUTE" || phase === "RESUME_ROUTE") return "ARRIVE"
  if (phase === "PAUSE_ROUTE") return null
  if (phase === "HANDOFF_COMPLETE") return null
  return "START_ROUTE"
}

function actionLabel(action: "START_ROUTE" | "ARRIVE" | "HANDOFF") {
  if (action === "START_ROUTE") return "Start Route"
  if (action === "ARRIVE") return "Mark Arrived"
  return "Finish Handoff"
}

export default function DriverDashboardPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [openLegs, setOpenLegs] = useState<Leg[]>([])
  const [myLegs, setMyLegs] = useState<Leg[]>([])
  const [workflowByLeg, setWorkflowByLeg] = useState<Record<string, LegWorkflow>>({})
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)
  const [distanceToDropMiles, setDistanceToDropMiles] = useState<number | null>(null)
  const [livePosition, setLivePosition] = useState<{ lat: number; lng: number } | null>(null)
  const [filter, setFilter] = useState<"all" | "nearby" | "high-pay">("all")
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [confirmHandoffLegId, setConfirmHandoffLegId] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<"idle" | "watching" | "unsupported" | "blocked">("idle")
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hosNowMs, setHosNowMs] = useState(() => Date.now())
  const lastGpsSendAtRef = useRef(0)
  const gpsUpdateInFlightRef = useRef(false)

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

        const sortedClaimed = [...claimedLegs]
          .sort((a, b) => a.sequence - b.sequence)
        const activeClaimed = sortedClaimed.filter((leg) => leg.status !== "COMPLETED")
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
        setMyLegs(activeClaimed)
        setWorkflowByLeg(nextWorkflowByLeg)
        setHosNowMs(Date.now())

        setSelectedLegId((previous) => {
          if (focusLegId && activeClaimed.some((leg) => leg.id === focusLegId)) return focusLegId
          if (previous && activeClaimed.some((leg) => leg.id === previous)) return previous
          const activeLeg = activeClaimed.find((leg) => leg.status === "IN_TRANSIT")
          return activeLeg?.id || activeClaimed[0]?.id || null
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
    setDistanceToDropMiles(null)
  }, [selectedLegId])

  useEffect(() => {
    if (!driver?.id) return
    if (typeof window === "undefined" || !window.navigator?.geolocation) {
      setGpsStatus("unsupported")
      setGpsError("GPS is not supported on this device.")
      return
    }

    let cancelled = false
    setGpsStatus("watching")
    setGpsError(null)

    const watchId = window.navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const accuracy = position.coords.accuracy

        setDriver((previous) => (previous ? { ...previous, currentLat: lat, currentLng: lng } : previous))
        setLivePosition({ lat, lng })

        const now = Date.now()
        if (gpsUpdateInFlightRef.current) return
        if (now - lastGpsSendAtRef.current < 5000) return

        gpsUpdateInFlightRef.current = true
        lastGpsSendAtRef.current = now
        void updateDriverLiveLocation({ lat, lng, accuracy })
          .then((updated) => {
            if (cancelled) return
            setDriver(updated)
            setGpsStatus("watching")
            setGpsError(null)
          })
          .catch((gpsUpdateError) => {
            if (cancelled) return
            setGpsError(gpsUpdateError instanceof Error ? gpsUpdateError.message : "Failed to sync live GPS")
          })
          .finally(() => {
            gpsUpdateInFlightRef.current = false
          })
      },
      (geoError) => {
        if (cancelled) return
        setGpsStatus("blocked")
        setGpsError(geoError?.message || "Location permission denied.")
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    )

    return () => {
      cancelled = true
      window.navigator.geolocation.clearWatch(watchId)
    }
  }, [driver?.id])

  const allLegEvents = useMemo(
    () =>
      Object.values(workflowByLeg)
        .flatMap((workflow) => workflow.events || [])
        .filter((event) => !driver?.id || event.driverId === driver.id),
    [driver?.id, workflowByLeg]
  )

  const hosUsage = useMemo(() => computeHosUsage(allLegEvents, hosNowMs), [allLegEvents, hosNowMs])

  useEffect(() => {
    if (!hosUsage.activelyDriving) return
    const intervalId = window.setInterval(() => setHosNowMs(Date.now()), 15000)
    return () => window.clearInterval(intervalId)
  }, [hosUsage.activelyDriving])

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
        if (leg.id !== selectedLegId) {
          setSelectedLegId(leg.id)
          setNotice("Open the selected leg route and get within the drop-zone radius before finishing handoff.")
          return
        }
        if (distanceToDropMiles === null) {
          setNotice("Waiting for live GPS distance to drop zone...")
          return
        }
        if (distanceToDropMiles > HANDOFF_COMPLETION_RADIUS_MILES) {
          setError(
            `You are ${distanceToDropMiles.toFixed(2)} mi away. Move within ${HANDOFF_COMPLETION_RADIUS_MILES.toFixed(
              2
            )} mi to finish handoff.`
          )
          return
        }
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
          const completed = await finishLegHandoff(leg.id, driver.id, {
            currentLat: driver.currentLat,
            currentLng: driver.currentLng,
          })
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
    [confirmHandoffLegId, distanceToDropMiles, driver, loadBoard, selectedLegId, workflowByLeg]
  )

  const handlePauseToggle = useCallback(
    async (leg: Leg) => {
      if (!driver) return

      const workflow = workflowByLeg[leg.id]
      const driveState = legDriveState(leg, workflow)
      if (driveState === "IDLE") return

      const nextAction = driveState === "PAUSED" ? "RESUME" : "PAUSE"
      setActionKey(`${nextAction}-${leg.id}`)
      setError(null)

      try {
        if (nextAction === "PAUSE") {
          await pauseLegRoute(leg.id, driver.id)
          setNotice("Drive paused. HOS will stay frozen until you resume.")
        } else {
          await resumeLegRoute(leg.id, driver.id)
          setNotice("Drive resumed. HOS tracking is active again.")
        }
        await loadBoard(leg.id)
      } catch (pauseError) {
        const message = pauseError instanceof Error ? pauseError.message : "Failed to update drive pause state"
        setError(message)
      } finally {
        setActionKey(null)
      }
    },
    [driver, loadBoard, workflowByLeg]
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

  const shiftUsed = Math.min(HOS_RULES.maxDrivingHours, hosUsage.shiftHours)
  const cycleUsed = Math.min(HOS_RULES.maxCycleHours, hosUsage.cycleHours)
  const shiftRemaining = Math.max(0, HOS_RULES.maxDrivingHours - shiftUsed)

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Hours of Service</span>
          <span className={`text-xs font-bold uppercase tracking-widest ${hosColor(shiftRemaining)}`}>
            {hosUsage.activelyDriving ? "Driving" : "Paused / Off Duty"}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-5xl font-bold tabular-nums tracking-tight ${hosColor(shiftRemaining)}`}>
            {shiftUsed.toFixed(1)}
          </span>
          <span className="text-lg text-muted-foreground font-medium">/ {HOS_RULES.maxDrivingHours} hrs driving</span>
        </div>

        <div className="relative h-3 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${hosBg(shiftRemaining)}`} style={{ width: `${hosBarPct(shiftUsed)}%` }} />
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">70-hr / 8-day cycle</span>
          <span className="text-xs text-muted-foreground tabular-nums">{cycleUsed.toFixed(1)} / {HOS_RULES.maxCycleHours} hrs</span>
        </div>

        <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden mb-4">
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${cycleBarPct(cycleUsed)}%` }} />
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

      <div className="flex items-center gap-2 px-1">
        <MapPin className={`h-3 w-3 ${gpsStatus === "watching" ? "text-success" : "text-warning"}`} />
        <span className="text-[10px] text-muted-foreground">
          {gpsStatus === "watching"
            ? "Live GPS active"
            : gpsStatus === "unsupported"
            ? "GPS unsupported on this device"
            : gpsStatus === "blocked"
            ? "GPS blocked - allow location for route completion"
            : "GPS not started"}
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

      {gpsError && (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-sm text-warning flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{gpsError}</span>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Live Route Map</h2>
            <p className="text-xs text-muted-foreground">
              Select a leg from the map or list to drive the route workflow.
            </p>
          </div>
        </div>

        {driver ? (
          <DriverMap
            driver={driver}
            myLegs={myLegs}
            openLegs={openLegs}
            livePosition={livePosition}
            selectedLegId={selectedLegId}
            onSelectLeg={setSelectedLegId}
          />
        ) : (
          <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
            Driver session is required to render the map.
          </div>
        )}
      </section>

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
              const driveState = legDriveState(leg, workflow)
              const pauseAction = driveState === "PAUSED" ? "RESUME" : driveState === "DRIVING" ? "PAUSE" : null
              const isSelected = selectedLegId === leg.id
              const handoffBlocked =
                action === "HANDOFF" &&
                isSelected &&
                (distanceToDropMiles === null || distanceToDropMiles > HANDOFF_COMPLETION_RADIUS_MILES)
              const isBusy = action ? actionKey === `${action}-${leg.id}` : false
              const isPauseBusy = pauseAction ? actionKey === `${pauseAction}-${leg.id}` : false
              const handoff = workflow?.handoffs[0]

              return (
                <div
                  key={leg.id}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
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

                  {action === "HANDOFF" && isSelected && distanceToDropMiles !== null && (
                    <div className="mt-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                      Distance to drop zone:{" "}
                      <span className="font-semibold text-foreground">{distanceToDropMiles.toFixed(2)} mi</span> (must be within{" "}
                      {HANDOFF_COMPLETION_RADIUS_MILES.toFixed(2)} mi)
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedLegId(leg.id)}>
                      <MapPin className="h-4 w-4" />
                      View Map
                    </Button>

                    <Button asChild variant="outline" size="sm">
                      <Link href={`/driver/route/${leg.id}`}>Get Directions</Link>
                    </Button>

                    {action && (
                      <Button
                        size="sm"
                        onClick={() => void handleLegAction(leg)}
                        disabled={isBusy || handoffBlocked}
                        variant={confirmHandoffLegId === leg.id ? "destructive" : "default"}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                        {action === "HANDOFF" && handoffBlocked
                          ? distanceToDropMiles === null
                            ? "Calculating Drop Distance..."
                            : `Move Within ${HANDOFF_COMPLETION_RADIUS_MILES.toFixed(2)} mi`
                          : confirmHandoffLegId === leg.id
                          ? "Confirm Handoff"
                          : actionLabel(action)}
                      </Button>
                    )}

                    {pauseAction && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handlePauseToggle(leg)}
                        disabled={isPauseBusy}
                      >
                        {isPauseBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                        {pauseAction === "PAUSE" ? "Pause Drive" : "Resume Drive"}
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
                Leg {selectedLeg.sequence} · Current location to pickup/transfer, then pickup to drop
              </p>
            </div>
            {driver && (
              <Link className="text-xs text-primary font-semibold" href={`/driver/route/${selectedLeg.id}`}>
                Get Directions
              </Link>
            )}
          </div>

          {driver ? (
            <LegRouteDirections
              driver={driver}
              leg={selectedLeg}
              onDistanceMilesChange={setDistanceToDropMiles}
            />
          ) : null}
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
