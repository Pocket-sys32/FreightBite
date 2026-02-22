"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { GoogleMap, InfoWindowF, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api"
import type { Driver, Leg, LegStatus } from "@/lib/mock-data"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""

interface DriverMapProps {
  driver: Driver
  myLegs: Leg[]
  openLegs: Leg[]
  livePosition?: { lat: number; lng: number } | null
  selectedLegId?: string | null
  onSelectLeg?: (legId: string) => void
}

interface RoutedLeg {
  leg: Leg
  isMine: boolean
  path: Array<{ lat: number; lng: number }>
  marker: { lat: number; lng: number }
}

function toLatLng(point: any): { lat: number; lng: number } | null {
  if (!point) return null
  if (typeof point.lat === "function" && typeof point.lng === "function") {
    return { lat: point.lat(), lng: point.lng() }
  }
  if (typeof point.lat === "number" && typeof point.lng === "number") {
    return { lat: point.lat, lng: point.lng }
  }
  return null
}

function routePathFromDirections(route: any): Array<{ lat: number; lng: number }> {
  const steps = (route?.legs || []).flatMap((leg: any) => leg?.steps || [])
  const points: Array<{ lat: number; lng: number }> = []

  for (const step of steps) {
    for (const rawPoint of step?.path || []) {
      const point = toLatLng(rawPoint)
      if (point) points.push(point)
    }
  }

  if (points.length > 1) return points

  const overview = (route?.overview_path || []).map((rawPoint: any) => toLatLng(rawPoint)).filter(Boolean)
  return overview as Array<{ lat: number; lng: number }>
}

function statusColor(status: LegStatus): string {
  switch (status) {
    case "IN_TRANSIT":
      return "#1D9A6C"
    case "ASSIGNED":
      return "#CC8400"
    case "SEARCHING":
      return "#B79A00"
    case "COMPLETED":
      return "#2C7A58"
    default:
      return "#6B7280"
  }
}

function statusLabel(status: LegStatus): string {
  switch (status) {
    case "IN_TRANSIT":
      return "In Transit"
    case "ASSIGNED":
      return "Assigned"
    case "SEARCHING":
      return "Searching"
    case "COMPLETED":
      return "Completed"
    default:
      return "Open"
  }
}

function legOriginAddress(leg: Leg): string | { lat: number; lng: number } {
  const value = leg.originAddress?.trim()
  if (value) return value
  if (typeof leg.originLat === "number" && typeof leg.originLng === "number") {
    return { lat: leg.originLat, lng: leg.originLng }
  }
  return `${leg.origin}, ${leg.originState}`
}

function legDestinationAddress(leg: Leg): string | { lat: number; lng: number } {
  const value = leg.destinationAddress?.trim()
  if (value) return value
  if (typeof leg.destinationLat === "number" && typeof leg.destinationLng === "number") {
    return { lat: leg.destinationLat, lng: leg.destinationLng }
  }
  return `${leg.destination}, ${leg.destinationState}`
}

export function DriverMap({ driver, myLegs, openLegs, livePosition, selectedLegId, onSelectLeg }: DriverMapProps) {
  const mapRef = useRef<any>(null)
  const [selectedLeg, setSelectedLeg] = useState<Leg | null>(null)
  const [popupCoord, setPopupCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [routedLegs, setRoutedLegs] = useState<RoutedLeg[]>([])
  const [routeError, setRouteError] = useState<string | null>(null)
  const markerPosition = useMemo(
    () => livePosition || { lat: driver.currentLat, lng: driver.currentLng },
    [driver.currentLat, driver.currentLng, livePosition]
  )

  const mergedLegs = useMemo(() => {
    const activeMyLegs = myLegs.filter((leg) => leg.status !== "COMPLETED")
    const mine = new Set(activeMyLegs.map((leg) => leg.id))
    const dedupedOpen = openLegs.filter((leg) => !mine.has(leg.id) && leg.status !== "COMPLETED")
    return [
      ...activeMyLegs.map((leg) => ({ leg, isMine: true })),
      ...dedupedOpen.map((leg) => ({ leg, isMine: false })),
    ]
  }, [myLegs, openLegs])

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  })

  useEffect(() => {
    let cancelled = false

    const loadRoutes = async () => {
      if (!isLoaded) return

      const googleObj = (window as Window & { google?: any }).google
      if (!googleObj?.maps) return

      if (mergedLegs.length === 0) {
        setRoutedLegs([])
        setRouteError(null)
        return
      }

      try {
        const service = new googleObj.maps.DirectionsService()
        const routes: RoutedLeg[] = []

        for (const item of mergedLegs) {
          try {
            const response = await service.route({
              origin: legOriginAddress(item.leg),
              destination: legDestinationAddress(item.leg),
              travelMode: googleObj.maps.TravelMode.DRIVING,
            })
            const route = response?.routes?.[0]
            const overviewPath = routePathFromDirections(route)
            if (overviewPath.length === 0) continue

            const marker = overviewPath[Math.floor(overviewPath.length / 2)]
            routes.push({
              leg: item.leg,
              isMine: item.isMine,
              path: overviewPath,
              marker,
            })
          } catch {
            continue
          }
        }

        if (cancelled) return
        setRoutedLegs(routes)
        setRouteError(null)
      } catch (error) {
        if (cancelled) return
        setRouteError(error instanceof Error ? error.message : "Failed to build map routes")
        setRoutedLegs([])
      }
    }

    void loadRoutes()

    return () => {
      cancelled = true
    }
  }, [isLoaded, mergedLegs])

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    const googleObj = (window as Window & { google?: any }).google
    if (!googleObj?.maps) return

    const bounds = new googleObj.maps.LatLngBounds()
    bounds.extend(markerPosition)

    const visibleRoutes =
      selectedLegId && routedLegs.some((item) => item.leg.id === selectedLegId)
        ? routedLegs.filter((item) => item.leg.id === selectedLegId)
        : routedLegs.filter((item) => item.isMine)

    const routesToFit = visibleRoutes.length > 0 ? visibleRoutes : routedLegs

    if (!selectedLegId && livePosition) {
      mapRef.current.panTo(markerPosition)
      mapRef.current.setZoom(13)
      return
    }

    for (const item of routesToFit) {
      for (const point of item.path) {
        bounds.extend(point)
      }
    }
    mapRef.current.fitBounds(bounds, 70)
  }, [isLoaded, livePosition, markerPosition, routedLegs, selectedLegId])

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to enable the driver map.
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-destructive text-center">
        Failed to load Google Maps.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Loading Google Maps...
      </div>
    )
  }

  if (routeError) {
    return (
      <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Unable to build live leg routes from addresses.
      </div>
    )
  }

  if (routedLegs.length === 0) {
    return (
      <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        No active routes to display.
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border" style={{ height: "340px" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        onLoad={(map) => {
          mapRef.current = map
        }}
        center={markerPosition}
        zoom={11}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {routedLegs.map((item) => {
          const selected = selectedLegId === item.leg.id
          return (
            <PolylineF
              key={`line-${item.leg.id}`}
              path={item.path}
              options={{
                strokeColor: statusColor(item.leg.status),
                strokeOpacity: item.isMine ? 0.95 : 0.42,
                strokeWeight: selected ? 6 : item.isMine ? 4 : 2,
              }}
            />
          )
        })}

        <MarkerF
          position={markerPosition}
          label={{ text: "You", color: "#0F172A", fontWeight: "700", fontSize: "10px" }}
        />

        {routedLegs.map((item) => (
          <MarkerF
            key={`marker-${item.leg.id}`}
            position={item.marker}
            label={{
              text: String(item.leg.sequence),
              color: "#0F172A",
              fontWeight: "700",
              fontSize: "11px",
            }}
            onClick={() => {
              setSelectedLeg(item.leg)
              setPopupCoord(item.marker)
              onSelectLeg?.(item.leg.id)
            }}
          />
        ))}

        {selectedLeg && popupCoord && (
          <InfoWindowF
            position={popupCoord}
            onCloseClick={() => {
              setSelectedLeg(null)
              setPopupCoord(null)
            }}
          >
            <div className="min-w-[220px] p-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                  {selectedLeg.sequence}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {statusLabel(selectedLeg.status)}
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {selectedLeg.origin} {">"} {selectedLeg.destination}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedLeg.miles} mi · ${selectedLeg.ratePerMile.toFixed(2)}/mi
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{selectedLeg.originAddress}</p>
              <p className="text-[10px] text-muted-foreground">{selectedLeg.destinationAddress}</p>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> You
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary" /> My legs
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/70" /> Open legs
        </span>
      </div>
    </div>
  )
}
