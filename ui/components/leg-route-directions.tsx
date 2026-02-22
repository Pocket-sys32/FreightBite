"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api"
import type { Driver, Leg } from "@/lib/mock-data"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""
const APPROACH_COLOR = "#2563EB"
const HAUL_COLOR = "#F97316"

interface RouteStep {
  instruction: string
  distanceMiles: number
  durationMinutes: number
}

interface RouteSegment {
  id: "to-pickup" | "pickup-to-drop"
  title: string
  from: { lat: number; lng: number; label: string }
  to: { lat: number; lng: number; label: string }
  distanceMiles: number
  durationMinutes: number
  path: Array<{ lat: number; lng: number }>
  steps: RouteStep[]
  color: string
}

interface RouteDetails {
  segments: RouteSegment[]
  totalDistanceMiles: number
  totalDurationMinutes: number
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function pickupInput(leg: Leg): string | { lat: number; lng: number } {
  const address = leg.originAddress?.trim()
  if (address) return address
  if (typeof leg.originLat === "number" && typeof leg.originLng === "number") {
    return { lat: leg.originLat, lng: leg.originLng }
  }
  return `${leg.origin}, ${leg.originState}`
}

function destinationInput(leg: Leg): string | { lat: number; lng: number } {
  const address = leg.destinationAddress?.trim()
  if (address) return address
  if (typeof leg.destinationLat === "number" && typeof leg.destinationLng === "number") {
    return { lat: leg.destinationLat, lng: leg.destinationLng }
  }
  return `${leg.destination}, ${leg.destinationState}`
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 3958.8 * (2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav)))
}

interface LegRouteDirectionsProps {
  driver: Driver
  leg: Leg
  onDistanceMilesChange?: (miles: number | null) => void
  mapHeight?: number
  focusDriver?: boolean
  showSteps?: boolean
}

export function LegRouteDirections({
  driver,
  leg,
  onDistanceMilesChange,
  mapHeight = 280,
  focusDriver = false,
  showSteps = true,
}: LegRouteDirectionsProps) {
  const mapRef = useRef<any>(null)
  const [details, setDetails] = useState<RouteDetails | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const routeLat = Number(driver.currentLat.toFixed(4))
  const routeLng = Number(driver.currentLng.toFixed(4))

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  })

  useEffect(() => {
    let cancelled = false

    const loadDirections = async () => {
      if (!isLoaded) return

      const googleObj = (window as Window & { google?: any }).google
      if (!googleObj?.maps) return

      setLoadingRoute(true)
      setRouteError(null)

      try {
        const service = new googleObj.maps.DirectionsService()
        const [toPickupResponse, pickupToDropResponse] = await Promise.all([
          service.route({
            origin: { lat: routeLat, lng: routeLng },
            destination: pickupInput(leg),
            travelMode: googleObj.maps.TravelMode.DRIVING,
          }),
          service.route({
            origin: pickupInput(leg),
            destination: destinationInput(leg),
            travelMode: googleObj.maps.TravelMode.DRIVING,
          }),
        ])

        const toPickupRoute = toPickupResponse?.routes?.[0]
        const toPickupLeg = toPickupRoute?.legs?.[0]
        const pickupToDropRoute = pickupToDropResponse?.routes?.[0]
        const pickupToDropLeg = pickupToDropRoute?.legs?.[0]
        if (!toPickupRoute || !toPickupLeg || !pickupToDropRoute || !pickupToDropLeg) {
          throw new Error("No route returned")
        }

        const toPickupPath = (toPickupRoute.overview_path || []).map((point: any) => ({
          lat: point.lat(),
          lng: point.lng(),
        }))
        const pickupToDropPath = (pickupToDropRoute.overview_path || []).map((point: any) => ({
          lat: point.lat(),
          lng: point.lng(),
        }))

        const toPickupSteps = (toPickupLeg.steps || []).slice(0, 8).map((step: any) => ({
          instruction: stripHtml(step.instructions || "Continue"),
          distanceMiles: Number(((step.distance?.value || 0) * 0.000621371).toFixed(2)),
          durationMinutes: Number(((step.duration?.value || 0) / 60).toFixed(1)),
        }))

        const pickupToDropSteps = (pickupToDropLeg.steps || []).slice(0, 8).map((step: any) => ({
          instruction: stripHtml(step.instructions || "Continue"),
          distanceMiles: Number(((step.distance?.value || 0) * 0.000621371).toFixed(2)),
          durationMinutes: Number(((step.duration?.value || 0) / 60).toFixed(1)),
        }))

        const segments: RouteSegment[] = [
          {
            id: "to-pickup",
            title: "Drive to Pickup / Transfer",
            from: {
              lat: toPickupLeg.start_location.lat(),
              lng: toPickupLeg.start_location.lng(),
              label: driver.currentCity || "Current location",
            },
            to: {
              lat: toPickupLeg.end_location.lat(),
              lng: toPickupLeg.end_location.lng(),
              label: leg.originAddress || `${leg.origin}, ${leg.originState}`,
            },
            distanceMiles: Number(((toPickupLeg.distance?.value || 0) * 0.000621371).toFixed(2)),
            durationMinutes: Number(((toPickupLeg.duration?.value || 0) / 60).toFixed(1)),
            path: toPickupPath,
            steps: toPickupSteps,
            color: APPROACH_COLOR,
          },
          {
            id: "pickup-to-drop",
            title: "Pickup / Transfer to Drop",
            from: {
              lat: pickupToDropLeg.start_location.lat(),
              lng: pickupToDropLeg.start_location.lng(),
              label: leg.originAddress || `${leg.origin}, ${leg.originState}`,
            },
            to: {
              lat: pickupToDropLeg.end_location.lat(),
              lng: pickupToDropLeg.end_location.lng(),
              label: leg.destinationAddress || `${leg.destination}, ${leg.destinationState}`,
            },
            distanceMiles: Number(((pickupToDropLeg.distance?.value || 0) * 0.000621371).toFixed(2)),
            durationMinutes: Number(((pickupToDropLeg.duration?.value || 0) / 60).toFixed(1)),
            path: pickupToDropPath,
            steps: pickupToDropSteps,
            color: HAUL_COLOR,
          },
        ]

        const dropMiles = haversineMiles(
          routeLat,
          routeLng,
          segments[1].to.lat,
          segments[1].to.lng
        )

        if (cancelled) return

        setDetails({
          segments,
          totalDistanceMiles: Number((segments[0].distanceMiles + segments[1].distanceMiles).toFixed(2)),
          totalDurationMinutes: Number((segments[0].durationMinutes + segments[1].durationMinutes).toFixed(1)),
        })
        onDistanceMilesChange?.(Number(dropMiles.toFixed(2)))
      } catch (error) {
        if (!cancelled) {
          setDetails(null)
          setRouteError(error instanceof Error ? error.message : "Failed to load directions")
          onDistanceMilesChange?.(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingRoute(false)
        }
      }
    }

    void loadDirections()

    return () => {
      cancelled = true
      onDistanceMilesChange?.(null)
    }
  }, [driver.currentCity, isLoaded, leg, onDistanceMilesChange, routeLat, routeLng])

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !details?.segments?.length) return
    const googleObj = (window as Window & { google?: any }).google
    if (!googleObj?.maps) return

    if (focusDriver) {
      mapRef.current.panTo({ lat: driver.currentLat, lng: driver.currentLng })
      mapRef.current.setZoom(14)
      return
    }

    const bounds = new googleObj.maps.LatLngBounds()
    for (const segment of details.segments) {
      for (const point of segment.path) {
        bounds.extend(point)
      }
      bounds.extend(segment.from)
      bounds.extend(segment.to)
    }
    mapRef.current.fitBounds(bounds, 70)
  }, [details?.segments, driver.currentLat, driver.currentLng, focusDriver, isLoaded])

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
        Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to enable live directions.
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
        Failed to load Google Maps for directions.
      </div>
    )
  }

  if (loadingRoute || !isLoaded) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Google route and turn-by-turn directions...
      </div>
    )
  }

  if (!details || routeError) {
    return <p className="text-sm text-muted-foreground">No map/directions available for this leg yet.</p>
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-secondary/20 p-4">
        <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ height: `${mapHeight}px` }}>
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            onLoad={(map) => {
              mapRef.current = map
            }}
            center={{ lat: driver.currentLat, lng: driver.currentLng }}
            zoom={8}
            options={{
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          >
            {details.segments.map((segment) => (
              <PolylineF
                key={segment.id}
                path={segment.path}
                options={{
                  strokeColor: segment.color,
                  strokeOpacity: 0.92,
                  strokeWeight: 5,
                }}
              />
            ))}
            <MarkerF
              position={details.segments[0].from}
              label={{ text: "You", color: "#0F172A", fontWeight: "700", fontSize: "10px" }}
            />
            <MarkerF
              position={details.segments[0].to}
              label={{ text: "Pickup", color: "#0F172A", fontWeight: "700", fontSize: "10px" }}
            />
            <MarkerF
              position={details.segments[1].to}
              label={{ text: "Drop", color: "#0F172A", fontWeight: "700", fontSize: "10px" }}
            />
          </GoogleMap>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: APPROACH_COLOR }} />
            To pickup/transfer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: HAUL_COLOR }} />
            Pickup to drop
          </span>
        </div>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="font-semibold text-foreground">To pickup:</span>{" "}
          {details.segments[0].distanceMiles.toFixed(1)} mi · {details.segments[0].durationMinutes.toFixed(0)} min
        </p>
        <p>
          <span className="font-semibold text-foreground">Pickup to drop:</span>{" "}
          {details.segments[1].distanceMiles.toFixed(1)} mi · {details.segments[1].durationMinutes.toFixed(0)} min
        </p>
        <p>
          <span className="font-semibold text-foreground">Current location:</span>{" "}
          {details.segments[0].from.label} ({details.segments[0].from.lat.toFixed(5)}, {details.segments[0].from.lng.toFixed(5)})
        </p>
        <p>
          <span className="font-semibold text-foreground">Drop destination:</span>{" "}
          {details.segments[1].to.label} ({details.segments[1].to.lat.toFixed(5)}, {details.segments[1].to.lng.toFixed(5)})
        </p>
        <p>
          <span className="font-semibold text-foreground">Total distance:</span> {details.totalDistanceMiles.toFixed(1)} mi
        </p>
        <p>
          <span className="font-semibold text-foreground">Total ETA:</span> {details.totalDurationMinutes.toFixed(0)} min
        </p>
      </div>

      {showSteps && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-secondary/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Turn-by-Turn
          </div>
          <div className="divide-y divide-border">
            {details.segments.map((segment) => (
              <div key={segment.id}>
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  {segment.title}
                </div>
                <ol className="divide-y divide-border/50">
                  {segment.steps.map((step, index) => (
                    <li key={`${segment.id}-${step.instruction}-${index}`} className="px-4 py-3 text-sm text-foreground flex items-start gap-3">
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
            ))}
          </div>
        </div>
      )}
    </>
  )
}
