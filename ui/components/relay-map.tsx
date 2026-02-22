"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { GoogleMap, InfoWindowF, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api"
import type { Leg, LegStatus } from "@/lib/mock-data"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""

function statusColor(status: LegStatus): string {
  switch (status) {
    case "IN_TRANSIT":
    case "COMPLETED":
      return "#26A269"
    case "ASSIGNED":
      return "#D58A0E"
    case "SEARCHING":
      return "#C3A100"
    default:
      return "#6B7280"
  }
}

function statusLabel(status: LegStatus): string {
  switch (status) {
    case "IN_TRANSIT":
      return "In Transit"
    case "COMPLETED":
      return "Completed"
    case "ASSIGNED":
      return "Assigned"
    case "SEARCHING":
      return "Searching"
    default:
      return "Open"
  }
}

function legOriginAddress(leg: Leg): string {
  const value = leg.originAddress?.trim()
  if (value) return value
  return `${leg.origin}, ${leg.originState}`
}

function legDestinationAddress(leg: Leg): string {
  const value = leg.destinationAddress?.trim()
  if (value) return value
  return `${leg.destination}, ${leg.destinationState}`
}

interface RelayMapProps {
  legs: Leg[]
}

interface RelayMarker {
  lat: number
  lng: number
  leg: Leg
}

export function RelayMap({ legs }: RelayMapProps) {
  const mapRef = useRef<any>(null)
  const [routedLegs, setRoutedLegs] = useState<Array<{ leg: Leg; path: Array<{ lat: number; lng: number }>; marker: RelayMarker }>>([])
  const [selectedLeg, setSelectedLeg] = useState<Leg | null>(null)
  const [popupCoord, setPopupCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const orderedLegs = useMemo(() => [...legs].sort((a, b) => a.sequence - b.sequence), [legs])

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  })

  useEffect(() => {
    let cancelled = false

    const loadRoute = async () => {
      if (!isLoaded || orderedLegs.length === 0) {
        setRoutedLegs([])
        setRouteError(null)
        return
      }

      const googleObj = (window as Window & { google?: any }).google
      if (!googleObj?.maps) return

      try {
        const service = new googleObj.maps.DirectionsService()
        const nextRoutes: Array<{ leg: Leg; path: Array<{ lat: number; lng: number }>; marker: RelayMarker }> = []

        for (const leg of orderedLegs) {
          try {
            const response = await service.route({
              origin: legOriginAddress(leg),
              destination: legDestinationAddress(leg),
              travelMode: googleObj.maps.TravelMode.DRIVING,
            })
            const route = response?.routes?.[0]
            const overviewPath = (route?.overview_path || []).map((point: any) => ({
              lat: point.lat(),
              lng: point.lng(),
            }))
            if (overviewPath.length === 0) continue

            const end = route?.legs?.[0]?.end_location
            const marker = end?.lat && end?.lng
              ? { leg, lat: end.lat(), lng: end.lng() }
              : {
                  leg,
                  lat: overviewPath[overviewPath.length - 1].lat,
                  lng: overviewPath[overviewPath.length - 1].lng,
                }

            nextRoutes.push({
              leg,
              path: overviewPath,
              marker,
            })
          } catch {
            continue
          }
        }

        if (cancelled) return
        setRoutedLegs(nextRoutes)
        setRouteError(nextRoutes.length === 0 ? "No routes could be built from current addresses" : null)
      } catch (error) {
        if (cancelled) return
        setRouteError(error instanceof Error ? error.message : "Failed to route addresses")
        setRoutedLegs([])
      }
    }

    void loadRoute()

    return () => {
      cancelled = true
    }
  }, [isLoaded, orderedLegs])

  useEffect(() => {
    if (!isLoaded || !mapRef.current || routedLegs.length === 0) return

    const googleObj = (window as Window & { google?: any }).google
    if (!googleObj?.maps) return

    const bounds = new googleObj.maps.LatLngBounds()
    for (const route of routedLegs) {
      for (const point of route.path) {
        bounds.extend(point)
      }
    }
    mapRef.current.fitBounds(bounds, 70)
  }, [isLoaded, routedLegs])

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to enable the live relay map.
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-destructive text-center">
        Failed to load Google Maps.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Loading Google Maps...
      </div>
    )
  }

  if (orderedLegs.length === 0) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        No legs available to map.
      </div>
    )
  }

  if (routeError || routedLegs.length === 0) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Unable to build route from addresses right now.
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border" style={{ height: "400px" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        onLoad={(map) => {
          mapRef.current = map
        }}
        center={routedLegs[0].path[0]}
        zoom={5}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {routedLegs.map((route) => (
          <PolylineF
            key={`route-${route.leg.id}`}
            path={route.path}
            options={{
              strokeColor: statusColor(route.leg.status),
              strokeOpacity: route.leg.status === "IN_TRANSIT" ? 0.95 : 0.75,
              strokeWeight: route.leg.status === "IN_TRANSIT" ? 5 : 4,
            }}
          />
        ))}

        {routedLegs.map((route) => (
          <MarkerF
            key={route.leg.id}
            position={{ lat: route.marker.lat, lng: route.marker.lng }}
            onClick={() => {
              setSelectedLeg(route.leg)
              setPopupCoord({ lat: route.marker.lat, lng: route.marker.lng })
            }}
            label={{
              text: String(route.leg.sequence),
              color: "#111827",
              fontWeight: "700",
              fontSize: "11px",
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
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                  {selectedLeg.sequence}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: statusColor(selectedLeg.status) }}
                >
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

      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-card/95 border border-border px-3 py-2 text-[10px] font-semibold">
        {orderedLegs.map((leg) => (
          <div key={`legend-${leg.id}`} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(leg.status) }} />
            <span className="text-muted-foreground">Leg {leg.sequence}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
