"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, Navigation, MapPin } from "lucide-react"
import { LegRouteDirections } from "@/components/leg-route-directions"
import { type Driver, type Leg } from "@/lib/mock-data"
import { fetchCurrentDriver, fetchLegs, fetchLegWorkflow, updateDriverLiveLocation } from "@/lib/backend-api"

export default function DirectionsPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [activeLeg, setActiveLeg] = useState<Leg | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<"idle" | "watching" | "unsupported" | "blocked">("idle")
  const [gpsError, setGpsError] = useState<string | null>(null)

  const lastGpsSendAtRef = useRef(0)
  const gpsUpdateInFlightRef = useRef(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const currentDriver = await fetchCurrentDriver()
        if (!currentDriver) {
          if (!active) return
          setError("Sign in to see directions for your active leg.")
          setLoading(false)
          return
        }

        if (active) setDriver(currentDriver)

        const myLegs = await fetchLegs({ driverId: currentDriver.id })
        const inTransit = myLegs.filter((l) => l.status === "IN_TRANSIT")

        if (inTransit.length === 0) {
          if (active) {
            setActiveLeg(null)
            setError(null)
          }
          return
        }

        let best = inTransit[0]
        for (const leg of inTransit) {
          try {
            const wf = await fetchLegWorkflow(leg.id)
            const phase = (wf?.phase || "").toUpperCase()
            if (phase === "START_ROUTE" || phase === "AUTO_START_ROUTE" || phase === "RESUME_ROUTE") {
              best = leg
              break
            }
          } catch {
            // fallback to first in-transit leg
          }
        }

        if (active) setActiveLeg(best)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Failed to load directions")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [])

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

        setDriver((prev) => (prev ? { ...prev, currentLat: lat, currentLng: lng } : prev))

        const now = Date.now()
        if (gpsUpdateInFlightRef.current || now - lastGpsSendAtRef.current < 5000) return

        gpsUpdateInFlightRef.current = true
        lastGpsSendAtRef.current = now
        void updateDriverLiveLocation({ lat, lng, accuracy })
          .then((updated) => {
            if (!cancelled) {
              setDriver(updated)
              setGpsStatus("watching")
              setGpsError(null)
            }
          })
          .catch((err) => {
            if (!cancelled) setGpsError(err instanceof Error ? err.message : "Failed to sync GPS")
          })
          .finally(() => { gpsUpdateInFlightRef.current = false })
      },
      (geoError) => {
        if (!cancelled) {
          setGpsStatus("blocked")
          setGpsError(geoError?.message || "Location permission denied.")
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )

    return () => {
      cancelled = true
      window.navigator.geolocation.clearWatch(watchId)
    }
  }, [driver?.id])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finding your active route...
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
        <Navigation className="h-4 w-4" />
        Turn-by-Turn Directions
      </div>

      {gpsError && (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-sm text-warning flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{gpsError}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {!activeLeg && !error && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No active route</p>
          <p className="text-xs text-muted-foreground mb-4">
            Accept and start a leg from the{" "}
            <Link href="/driver" className="text-primary font-medium underline underline-offset-2">
              Loads board
            </Link>{" "}
            to see turn-by-turn directions here.
          </p>
          <p className="text-xs text-muted-foreground">
            GPS: {gpsStatus === "watching" ? "Live tracking active" : gpsStatus}
          </p>
        </div>
      )}

      {driver && activeLeg && (
        <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
          <h1 className="text-base font-semibold text-foreground">
            Leg {activeLeg.sequence}: {activeLeg.origin} &gt; {activeLeg.destination}
          </h1>
          <p className="text-xs text-muted-foreground">
            {activeLeg.miles} mi &middot; ${activeLeg.ratePerMile.toFixed(2)}/mi &middot; GPS: {gpsStatus === "watching" ? "Live" : gpsStatus}
          </p>
          <LegRouteDirections driver={driver} leg={activeLeg} mapHeight={560} focusDriver showSteps />
        </section>
      )}
    </div>
  )
}
