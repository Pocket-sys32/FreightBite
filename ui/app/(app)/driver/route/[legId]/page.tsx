"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, AlertCircle, Loader2, Navigation } from "lucide-react"
import { LegRouteDirections } from "@/components/leg-route-directions"
import { type Driver, type Leg } from "@/lib/mock-data"
import { fetchCurrentDriver, fetchLegs, updateDriverLiveLocation } from "@/lib/backend-api"

export default function DriverRoutePage() {
  const params = useParams<{ legId: string }>()
  const legId = params.legId

  const [driver, setDriver] = useState<Driver | null>(null)
  const [leg, setLeg] = useState<Leg | null>(null)
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
          setError("Authentication required")
          return
        }

        const [driverLegs, openLegs] = await Promise.all([
          fetchLegs({ driverId: currentDriver.id }),
          fetchLegs({ status: "OPEN" }),
        ])

        const nextLeg =
          driverLegs.find((item) => item.id === legId) ||
          openLegs.find((item) => item.id === legId) ||
          null

        if (!active) return
        setDriver(currentDriver)
        setLeg(nextLeg)
        if (!nextLeg) setError("Route leg not found.")
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Failed to load route")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [legId])

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

  const title = useMemo(() => {
    if (!leg) return "Route Navigation"
    return `Leg ${leg.sequence}: ${leg.origin} > ${leg.destination}`
  }, [leg])

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading route...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <ButtonLink href="/driver" label="Back to Dashboard" />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
          <Navigation className="h-4 w-4" />
          In-App Directions
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>

        {gpsError && (
          <div className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-sm text-warning flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{gpsError}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          GPS status: {gpsStatus === "watching" ? "Live tracking active" : gpsStatus}
        </p>

        {driver && leg ? (
          <LegRouteDirections driver={driver} leg={leg} mapHeight={560} focusDriver showSteps />
        ) : (
          <p className="text-sm text-muted-foreground">{error || "Route unavailable."}</p>
        )}
      </section>
    </div>
  )
}

function ButtonLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}
