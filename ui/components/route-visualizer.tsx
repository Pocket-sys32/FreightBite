"use client"

import { StatusBadge } from "@/components/status-badge"
import type { Leg } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function RouteVisualizer({ legs }: { legs: Leg[] }) {
  return (
    <div className="relative flex flex-col gap-0">
      {legs.map((leg, i) => {
        const allIn = Math.round((leg.rateCents + leg.fuelSurchargeCents) / 100)
        return (
          <div key={leg.id} className="relative flex items-stretch gap-5">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div
                  className={cn(
                    "h-5 w-5 rounded-full z-10 ring-4 ring-card",
                    leg.status === "IN_TRANSIT" && "bg-success",
                    leg.status === "ASSIGNED" && "bg-primary",
                    leg.status === "SEARCHING" && "bg-warning",
                    leg.status === "COMPLETED" && "bg-success",
                    leg.status === "OPEN" && "bg-border",
                  )}
                />
                {(leg.status === "IN_TRANSIT" || leg.status === "SEARCHING") && (
                  <div
                    className={cn(
                      "absolute inset-0 rounded-full animate-ping opacity-30",
                      leg.status === "IN_TRANSIT" && "bg-success",
                      leg.status === "SEARCHING" && "bg-warning",
                    )}
                  />
                )}
              </div>
              {i < legs.length - 1 && (
                <div className="relative w-px flex-1 min-h-[80px]">
                  <div className={cn(
                    "absolute inset-0 w-px",
                    (leg.status === "COMPLETED" || leg.status === "IN_TRANSIT")
                      ? "bg-gradient-to-b from-success/60 to-success/20"
                      : "bg-border"
                  )} />
                </div>
              )}
            </div>

            {/* Leg Info */}
            <div className="flex-1 pb-8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.15em] uppercase">
                      Leg {leg.sequence}
                    </span>
                    <StatusBadge status={leg.status} />
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {leg.origin}
                    <span className="mx-1.5 text-muted-foreground/40">{">"}</span>
                    {leg.destination}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {leg.miles} mi{leg.deadheadMiles > 0 ? ` (+${leg.deadheadMiles} DH)` : ""} &middot; {leg.handoffPoint}
                  </p>
                  {leg.driverName && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 rounded-full px-2.5 py-0.5">
                      {leg.driverName}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-serif font-medium text-foreground">
                    ${allIn.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    ${leg.ratePerMile.toFixed(2)}/mi
                  </p>
                </div>
              </div>

              {leg.driverName && (
                <div className="mt-3 rounded-xl bg-secondary/60 border border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-primary">AI</span>{" "}
                    {leg.sequence === 1
                      ? `${leg.driverName} is 12 mi from Best Buy DC in Melrose Park with 9.5h HOS. He's run I-80 EB/WB 47 times this year. MC-1042871, KeepTruckin ELD verified.`
                      : leg.sequence === 2
                      ? `${leg.driverName} is at Pilot #391 in Coralville with 7h HOS and a 53ft reefer. She specializes in the I-80 corridor with 1,203 total loads. Samsara ELD verified.`
                      : "Searching for available drivers near North Platte, NE with 10+ hrs HOS and dry van equipment..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Final destination */}
      <div className="relative flex items-center gap-5">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="h-5 w-5 rounded-full bg-success ring-4 ring-card z-10" />
            <div className="absolute inset-0 rounded-full bg-success/30 animate-pulse" />
          </div>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-success tracking-[0.15em] uppercase">
            Destination
          </span>
          <p className="text-sm font-semibold text-foreground">
            {legs[legs.length - 1]?.destination}
          </p>
        </div>
      </div>
    </div>
  )
}
