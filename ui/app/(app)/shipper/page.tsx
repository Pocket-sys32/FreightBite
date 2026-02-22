"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  MapPin,
  ArrowRight,
  Send,
  Loader2,
  Package,
  Truck,
  DollarSign,
  Route,
  Sparkles,
  Weight,
  AlertCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RelayMap } from "@/components/relay-map"
import { RouteVisualizer } from "@/components/route-visualizer"
import { fetchLatestLoad, submitLoadByLabel } from "@/lib/backend-api"
import type { Load } from "@/lib/mock-data"

function statusLabel(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === "IN_TRANSIT") return "In Transit"
  if (normalized === "ASSIGNED") return "Assigned"
  if (normalized === "SEARCHING") return "Searching"
  if (normalized === "COMPLETED" || normalized === "COMPLETE") return "Completed"
  return "Open"
}

function statusClass(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === "IN_TRANSIT") return "bg-success/10 text-success"
  if (normalized === "ASSIGNED") return "bg-primary/10 text-primary"
  if (normalized === "SEARCHING") return "bg-warning/10 text-warning"
  if (normalized === "COMPLETED" || normalized === "COMPLETE") return "bg-success/10 text-success"
  return "bg-secondary text-muted-foreground"
}

export default function ShipperPortalPage() {
  const [origin, setOrigin] = useState("2700 S California Ave, Chicago, IL 60608")
  const [destination, setDestination] = useState("8155 Beech Ave, Fontana, CA 92335")
  const [totalContractPrice, setTotalContractPrice] = useState("4200")
  const [load, setLoad] = useState<Load | null>(null)
  const [loading, setLoading] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLatest = useCallback(async () => {
    setBootstrapping(true)
    setError(null)
    try {
      const latest = await fetchLatestLoad()
      setLoad(latest)
    } catch (latestError) {
      const message =
        latestError instanceof Error ? latestError.message : "Failed to load current relay chain"
      setError(message)
    } finally {
      setBootstrapping(false)
    }
  }, [])

  useEffect(() => {
    void loadLatest()
  }, [loadLatest])

  const handleSubmit = async () => {
    const price = Number(totalContractPrice)
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid total contract price.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const created = await submitLoadByLabel(origin, destination, price)
      setLoad(created)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to submit load"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    if (!load) return null
    const totalRate = load.legs.reduce((sum, leg) => sum + leg.rateCents + leg.fuelSurchargeCents, 0)
    const lineHaulOnly = load.legs.reduce((sum, leg) => sum + leg.rateCents, 0)
    const contractTotal = typeof load.contractTotalPayoutCents === "number" ? load.contractTotalPayoutCents : lineHaulOnly
    const assignedLegs = load.legs.filter(
      (leg) =>
        leg.status === "ASSIGNED" ||
        leg.status === "IN_TRANSIT" ||
        leg.status === "COMPLETED"
    ).length
    return { totalRate, lineHaulOnly, contractTotal, assignedLegs }
  }, [load])

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Shipper Portal</p>
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-3xl font-medium text-foreground lg:text-4xl">Submit a Load</h1>
          <Badge className="rounded-full bg-primary/10 text-primary border-0 text-[10px] font-semibold">
            AI Dispatch
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Route submissions now call the live backend segmentation API.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-7">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Package className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Load Details</h2>
            <p className="text-xs text-muted-foreground">
              Submits to <span className="font-mono">POST /api/loads/submit</span> and renders the returned legs.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-2 block text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
              Origin Address
            </label>
            <Input
              placeholder="2700 S California Ave, Chicago, IL 60608"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              className="h-11 rounded-xl border-border bg-secondary/40 focus:border-primary"
            />
          </div>
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <label className="mb-2 block text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
              Destination Address
            </label>
            <Input
              placeholder="8155 Beech Ave, Fontana, CA 92335"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="h-11 rounded-xl border-border bg-secondary/40 focus:border-primary"
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <label className="mb-2 block text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
              Total Contract $
            </label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="4200"
              value={totalContractPrice}
              onChange={(event) => setTotalContractPrice(event.target.value)}
              className="h-11 rounded-xl border-border bg-secondary/40 focus:border-primary"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading || !origin || !destination || !totalContractPrice}
            className="gap-2 h-11 rounded-full px-7 shrink-0 bg-foreground text-background hover:bg-foreground/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Segmenting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Load
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {bootstrapping ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
          Loading relay chain...
        </div>
      ) : load && summary ? (
        <>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="font-mono text-foreground font-semibold">{load.referenceNumber}</span>
              <span>{load.commodity}</span>
              <span className="flex items-center gap-1">
                <Weight className="h-3 w-3" /> {(load.weight / 1000).toFixed(1)}k lbs
              </span>
              <span>{load.equipment}</span>
              <span>Pickup: {load.pickupDate}</span>
              <span>Delivery: {load.deliveryDate}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[10px] text-muted-foreground mt-2">
              <span>Shipper: {load.shipper}</span>
              <span>Consignee: {load.consignee}</span>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { icon: Route, value: load.miles.toLocaleString(), unit: "mi", label: "Total Miles" },
              { icon: Truck, value: String(load.legs.length), unit: "legs", label: "Relay Legs" },
              { icon: MapPin, value: `${summary.assignedLegs}/${load.legs.length}`, unit: "", label: "Assigned" },
              {
                icon: DollarSign,
                value: `$${(summary.lineHaulOnly / 100).toLocaleString()}`,
                unit: "",
                label: "Line Haul",
              },
              {
                icon: DollarSign,
                value: `$${(summary.contractTotal / 100).toLocaleString()}`,
                unit: "",
                label: "Contract Total",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
                    {stat.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-serif text-2xl font-medium text-foreground">{stat.value}</span>
                  {stat.unit && <span className="text-sm text-muted-foreground">{stat.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="rounded-2xl border border-border bg-card">
              <div className="p-7">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-xl font-medium text-foreground">Relay Chain</h2>
                    <span className="font-mono text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                      {load.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-primary" />
                    {load.origin} {">"} {load.destination}
                  </div>
                </div>

                <div className="mb-6 rounded-xl overflow-hidden border border-border bg-secondary/30 p-4">
                  <RelayMap legs={load.legs} />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {["Leg", "Route", "Miles", "Rate", "Payout/mi", "Driver", "Status"].map((header) => (
                          <th
                            key={header}
                            className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {load.legs.map((leg) => {
                        const allIn = Math.round((leg.rateCents + leg.fuelSurchargeCents) / 100)
                        return (
                          <tr key={leg.id} className="border-b border-border/60 hover:bg-secondary/30 transition-colors">
                            <td className="py-4 pr-4">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-serif font-semibold text-foreground">
                                {leg.sequence}
                              </span>
                            </td>
                            <td className="py-4 pr-4">
                              <span className="font-medium text-foreground">
                                {leg.origin}
                                <span className="mx-1.5 text-muted-foreground/40">{">"}</span>
                                {leg.destination}
                              </span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {leg.commodity} &middot; {(leg.weight / 1000).toFixed(1)}k lbs
                              </p>
                            </td>
                            <td className="py-4 pr-4 font-mono text-muted-foreground">
                              {leg.miles}
                              {leg.deadheadMiles > 0 && (
                                <span className="text-warning text-[10px] ml-1">(+{leg.deadheadMiles} DH)</span>
                              )}
                            </td>
                            <td className="py-4 pr-4">
                              <span className="font-medium text-foreground">${allIn.toLocaleString()}</span>
                              <p className="text-[10px] text-muted-foreground">${leg.ratePerMile.toFixed(2)}/mi + FSC</p>
                            </td>
                            <td className="py-4 pr-4 font-mono text-foreground">
                              ${leg.ratePerMile.toFixed(2)}
                            </td>
                            <td className="py-4 pr-4">
                              {leg.driverName ? (
                                <span className="inline-flex items-center text-foreground text-xs font-medium bg-secondary px-2.5 py-1 rounded-full">
                                  {leg.driverName}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40 italic text-xs">Unassigned</span>
                              )}
                            </td>
                            <td className="py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusClass(
                                  leg.status
                                )}`}
                              >
                                {statusLabel(leg.status)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card h-fit">
              <div className="p-7">
                <div className="mb-6">
                  <h2 className="font-serif text-xl font-medium text-foreground">Live Timeline</h2>
                  <p className="text-xs text-muted-foreground mt-1">Real-time relay chain status</p>
                </div>
                <RouteVisualizer legs={load.legs} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
          No loads yet. Submit one above to generate relay legs from the backend.
        </div>
      )}
    </div>
  )
}
