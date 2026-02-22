"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Map, { Layer, Marker, Popup, Source } from "react-map-gl"
import type { MapRef } from "react-map-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { Leg, LegStatus } from "@/lib/mock-data"

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

const FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  "chicago, il": { lat: 41.8781, lng: -87.6298 },
  "melrose park, il": { lat: 41.9006, lng: -87.8567 },
  "iowa city, ia": { lat: 41.6611, lng: -91.5302 },
  "coralville, ia": { lat: 41.6766, lng: -91.5918 },
  "north platte, ne": { lat: 41.1239, lng: -100.7654 },
  "st. george, ut": { lat: 37.0965, lng: -113.5684 },
  "barstow, ca": { lat: 34.8958, lng: -117.0173 },
  "rialto, ca": { lat: 34.1064, lng: -117.3703 },
  "los angeles, ca": { lat: 34.0522, lng: -118.2437 },
  "omaha, ne": { lat: 41.2565, lng: -95.9345 },
  "denver, co": { lat: 39.7392, lng: -104.9903 },
}

function statusColor(status: LegStatus): string {
  switch (status) {
    case "IN_TRANSIT":
    case "COMPLETED":
      return "oklch(0.65 0.2 150)"
    case "ASSIGNED":
      return "oklch(0.65 0.14 45)"
    case "SEARCHING":
      return "oklch(0.75 0.15 70)"
    default:
      return "oklch(0.55 0.01 260)"
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

function resolveCoord(args: {
  city: string
  state: string
  address: string
  lat?: number
  lng?: number
}): { lat: number; lng: number } | null {
  if (typeof args.lat === "number" && typeof args.lng === "number") {
    return { lat: args.lat, lng: args.lng }
  }

  const cityKey = `${args.city}, ${args.state}`.toLowerCase()
  if (FALLBACK_COORDS[cityKey]) return FALLBACK_COORDS[cityKey]

  const rawCityKey = args.city.toLowerCase()
  if (FALLBACK_COORDS[rawCityKey]) return FALLBACK_COORDS[rawCityKey]

  const addressLower = args.address.toLowerCase()
  for (const [key, coord] of Object.entries(FALLBACK_COORDS)) {
    if (addressLower.includes(key)) return coord
  }

  return null
}

interface RelayMapProps {
  legs: Leg[]
}

export function RelayMap({ legs }: RelayMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [selectedLeg, setSelectedLeg] = useState<Leg | null>(null)
  const [popupCoord, setPopupCoord] = useState<{ lat: number; lng: number } | null>(null)

  const mappedLegs = useMemo(
    () =>
      legs
        .map((leg) => ({
          leg,
          origin: resolveCoord({
            city: leg.origin,
            state: leg.originState,
            address: leg.originAddress,
            lat: leg.originLat,
            lng: leg.originLng,
          }),
          destination: resolveCoord({
            city: leg.destination,
            state: leg.destinationState,
            address: leg.destinationAddress,
            lat: leg.destinationLat,
            lng: leg.destinationLng,
          }),
        }))
        .filter((item) => item.origin && item.destination) as Array<{
        leg: Leg
        origin: { lat: number; lng: number }
        destination: { lat: number; lng: number }
      }>,
    [legs]
  )

  const routeGeoJSON = useMemo(
    () => ({
      type: "FeatureCollection",
      features: mappedLegs.map((item) => ({
        type: "Feature",
        properties: {
          status: item.leg.status,
          color: statusColor(item.leg.status),
          sequence: item.leg.sequence,
          isActive: item.leg.status === "IN_TRANSIT" || item.leg.status === "ASSIGNED",
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [item.origin.lng, item.origin.lat],
            [item.destination.lng, item.destination.lat],
          ],
        },
      })),
    }),
    [mappedLegs]
  )

  const onMapLoad = useCallback(() => {
    if (!mapRef.current || mappedLegs.length === 0) return

    const allCoords = mappedLegs.flatMap((item) => [item.origin, item.destination])
    const lngs = allCoords.map((coord) => coord.lng)
    const lats = allCoords.map((coord) => coord.lat)

    mapRef.current.fitBounds(
      [
        [Math.min(...lngs) - 0.6, Math.min(...lats) - 0.6],
        [Math.max(...lngs) + 0.6, Math.max(...lats) + 0.6],
      ],
      { padding: 50, duration: 1000 }
    )
  }, [mappedLegs])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Add `NEXT_PUBLIC_MAPBOX_TOKEN` to enable the live relay map.
      </div>
    )
  }

  if (mappedLegs.length === 0) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        No leg coordinates available yet for map rendering.
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border" style={{ height: "400px" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -98.5, latitude: 39.5, zoom: 3.6 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onLoad={onMapLoad}
        attributionControl
        interactive
      >
        <Source id="relay-route" type="geojson" data={routeGeoJSON as never}>
          <Layer
            id="route-glow"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 8,
              "line-opacity": 0.15,
              "line-blur": 6,
            }}
          />
          <Layer
            id="route-line"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 3,
              "line-opacity": ["case", ["get", "isActive"], 0.9, 0.5],
              "line-dasharray": ["case", ["get", "isActive"], ["literal", [1, 0]], ["literal", [4, 3]]],
            }}
          />
        </Source>

        {mappedLegs.map((item) => {
          const mid = {
            lat: (item.origin.lat + item.destination.lat) / 2,
            lng: (item.origin.lng + item.destination.lng) / 2,
          }

          return (
            <Marker
              key={`leg-${item.leg.id}`}
              longitude={mid.lng}
              latitude={mid.lat}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                setSelectedLeg(item.leg)
                setPopupCoord(mid)
              }}
            >
              <div
                className="h-2.5 w-2.5 rounded-full border border-card"
                style={{ backgroundColor: statusColor(item.leg.status) }}
              />
            </Marker>
          )
        })}

        {selectedLeg && popupCoord && (
          <Popup
            longitude={popupCoord.lng}
            latitude={popupCoord.lat}
            anchor="bottom"
            onClose={() => {
              setSelectedLeg(null)
              setPopupCoord(null)
            }}
            closeButton
            closeOnClick={false}
          >
            <div className="p-2 min-w-[220px]">
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
          </Popup>
        )}
      </Map>
    </div>
  )
}
