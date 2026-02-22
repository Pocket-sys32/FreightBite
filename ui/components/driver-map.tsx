"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Map, { Layer, Marker, Popup, Source } from "react-map-gl"
import type { MapRef } from "react-map-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { Driver, Leg, LegStatus } from "@/lib/mock-data"

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

interface DriverMapProps {
  driver: Driver
  myLegs: Leg[]
  openLegs: Leg[]
  selectedLegId?: string | null
  onSelectLeg?: (legId: string) => void
}

export function DriverMap({ driver, myLegs, openLegs, selectedLegId, onSelectLeg }: DriverMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [selectedLeg, setSelectedLeg] = useState<Leg | null>(null)
  const [popupCoord, setPopupCoord] = useState<{ lat: number; lng: number } | null>(null)

  const mappedLegs = useMemo(() => {
    const myLegIds = new Set(myLegs.map((leg) => leg.id))
    const allLegs = [...myLegs, ...openLegs.filter((leg) => !myLegIds.has(leg.id))]

    return allLegs
      .map((leg) => {
        const origin = resolveCoord({
          city: leg.origin,
          state: leg.originState,
          address: leg.originAddress,
          lat: leg.originLat,
          lng: leg.originLng,
        })
        const destination = resolveCoord({
          city: leg.destination,
          state: leg.destinationState,
          address: leg.destinationAddress,
          lat: leg.destinationLat,
          lng: leg.destinationLng,
        })

        if (!origin || !destination) return null

        return {
          leg,
          origin,
          destination,
          isMine: myLegIds.has(leg.id),
        }
      })
      .filter((entry): entry is { leg: Leg; origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; isMine: boolean } => Boolean(entry))
  }, [myLegs, openLegs])

  const routeGeoJSON = useMemo(
    () => ({
      type: "FeatureCollection",
      features: mappedLegs.map((item) => ({
        type: "Feature",
        properties: {
          legId: item.leg.id,
          color: statusColor(item.leg.status),
          mine: item.isMine,
          selected: selectedLegId === item.leg.id,
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
    [mappedLegs, selectedLegId]
  )

  const onMapLoad = useCallback(() => {
    if (!mapRef.current) return

    const allCoords = [
      { lat: driver.currentLat, lng: driver.currentLng },
      ...mappedLegs.flatMap((item) => [item.origin, item.destination]),
    ]

    if (allCoords.length < 2) return

    const lngs = allCoords.map((coord) => coord.lng)
    const lats = allCoords.map((coord) => coord.lat)

    mapRef.current.fitBounds(
      [
        [Math.min(...lngs) - 0.5, Math.min(...lats) - 0.5],
        [Math.max(...lngs) + 0.5, Math.max(...lats) + 0.5],
      ],
      { padding: 50, duration: 900 }
    )
  }, [driver.currentLat, driver.currentLng, mappedLegs])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-[340px] rounded-xl border border-border bg-secondary/40 flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
        Add `NEXT_PUBLIC_MAPBOX_TOKEN` to enable the driver map.
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border" style={{ height: "340px" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: driver.currentLng || -98.5, latitude: driver.currentLat || 39.5, zoom: 4.8 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onLoad={onMapLoad}
        attributionControl
        interactive
      >
        <Source id="driver-relay-routes" type="geojson" data={routeGeoJSON as never}>
          <Layer
            id="driver-route-glow"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": ["case", ["get", "selected"], 8, 6],
              "line-opacity": 0.12,
              "line-blur": 5,
            }}
          />
          <Layer
            id="driver-route-line"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": ["case", ["get", "selected"], 4, ["case", ["get", "mine"], 3, 2]],
              "line-opacity": ["case", ["get", "mine"], 0.9, 0.45],
              "line-dasharray": ["case", ["get", "mine"], ["literal", [1, 0]], ["literal", [4, 3]]],
            }}
          />
        </Source>

        <Marker longitude={driver.currentLng} latitude={driver.currentLat} anchor="center">
          <div className="relative">
            <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/30 animate-ping" />
            <div className="relative h-3.5 w-3.5 rounded-full border border-white bg-sky-400" />
          </div>
        </Marker>

        {mappedLegs.map((item) => {
          const mid = {
            lat: (item.origin.lat + item.destination.lat) / 2,
            lng: (item.origin.lng + item.destination.lng) / 2,
          }
          const isSelected = selectedLegId === item.leg.id

          return (
            <Marker
              key={`driver-leg-${item.leg.id}`}
              longitude={mid.lng}
              latitude={mid.lat}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                setSelectedLeg(item.leg)
                setPopupCoord(mid)
                onSelectLeg?.(item.leg.id)
              }}
            >
              <div
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold"
                style={{
                  backgroundColor: isSelected ? "oklch(0.65 0.14 45)" : "oklch(0.2 0.01 260 / 0.9)",
                  borderColor: statusColor(item.leg.status),
                  color: isSelected ? "oklch(0.13 0.005 260)" : "oklch(0.93 0.005 80)",
                }}
              >
                {item.leg.sequence}
              </div>
            </Marker>
          )
        })}

        {selectedLeg && popupCoord && (
          <Popup
            longitude={popupCoord.lng}
            latitude={popupCoord.lat}
            anchor="bottom"
            closeButton
            closeOnClick={false}
            onClose={() => {
              setSelectedLeg(null)
              setPopupCoord(null)
            }}
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

      <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> Driver
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
