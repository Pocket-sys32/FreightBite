"use client"

import { useState } from "react"
import { Loader2, MapPin, CheckCircle2, Snowflake, Package } from "lucide-react"
import type { Leg } from "@/lib/mock-data"
import { HOS_RULES } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

interface LegCardProps {
  leg: Leg
  showAccept?: boolean
  accepted?: boolean
  accepting?: boolean
  onAccept?: (leg: Leg) => Promise<void> | void
}

export function LegCard({
  leg,
  showAccept = true,
  accepted = false,
  accepting = false,
  onAccept,
}: LegCardProps) {
  const [acceptedLocal, setAcceptedLocal] = useState(false)
  const [acceptingLocal, setAcceptingLocal] = useState(false)
  const isAccepted = accepted || acceptedLocal
  const isAccepting = accepting || acceptingLocal

  const pay = Math.round(leg.rateCents / 100)
  const driveHours = Math.round(leg.miles / HOS_RULES.avgSpeedMph)
  const fuelSurcharge = Math.round(leg.fuelSurchargeCents / 100)
  const totalPay = pay + fuelSurcharge
  const isReefer = leg.temperature !== undefined

  const summary = `${leg.miles} mi${leg.deadheadMiles > 0 ? ` (+${leg.deadheadMiles} DH)` : ""} to ${leg.handoffPoint.split("#")[0].trim()} in ${leg.destination} \u2014 ~${driveHours} hrs, $${totalPay.toLocaleString()} total.`

  const handleAccept = async () => {
    if (isAccepting || isAccepted) return
    if (!onAccept) {
      setAcceptedLocal(true)
      return
    }

    setAcceptingLocal(true)
    try {
      await onAccept(leg)
      setAcceptedLocal(true)
    } finally {
      setAcceptingLocal(false)
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl sm:rounded-2xl border transition-colors min-w-0",
        isAccepted
          ? "border-success/40 bg-success/5"
          : "border-border bg-card"
      )}
    >
      <div className="p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-primary/15">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-base font-bold text-foreground truncate">
              {leg.origin} <span className="text-muted-foreground font-normal mx-1">{">"}</span> {leg.destination}
            </p>
            <p className="text-xs text-muted-foreground truncate">{leg.originAddress}</p>
            <p className="text-xs text-muted-foreground truncate">{leg.destinationAddress}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono">{leg.loadId}</span>
              {isReefer && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-400/10 rounded-full px-2 py-0.5">
                  <Snowflake className="h-2.5 w-2.5" />
                  {leg.temperature}&deg;F
                </span>
              )}
              {leg.deadheadMiles > 0 && (
                <span className="text-[10px] text-warning font-medium">+{leg.deadheadMiles} mi DH</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 min-w-0">
          <div className="rounded-lg sm:rounded-xl bg-secondary p-2.5 sm:p-3 text-center min-w-0">
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{leg.miles}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">mi</p>
          </div>
          <div className="rounded-lg sm:rounded-xl bg-secondary p-2.5 sm:p-3 text-center min-w-0">
            <p className="text-lg sm:text-xl font-bold text-success tabular-nums">${totalPay.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">total</p>
          </div>
          <div className="rounded-lg sm:rounded-xl bg-secondary p-2.5 sm:p-3 text-center min-w-0">
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">${leg.ratePerMile.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">/mi</p>
          </div>
        </div>

        <div className="rounded-lg sm:rounded-xl bg-primary/8 border border-primary/15 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
          <p className="text-[11px] sm:text-xs text-muted-foreground">Handoff at</p>
          <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate">{leg.handoffPoint}</p>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{leg.handoffAddress}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-muted-foreground min-w-0">
          <Package className="h-3 w-3" />
          <span>{leg.commodity}</span>
          <span className="text-border">|</span>
          <span>{(leg.weight / 1000).toFixed(1)}k lbs</span>
          <span className="text-border">|</span>
          <span className="text-muted-foreground/60">FSC ${fuelSurcharge}</span>
        </div>

        {/* AI summary */}
        <p className="text-xs text-muted-foreground leading-relaxed italic">
          {summary}
        </p>

        {showAccept && !isAccepted && leg.status === "OPEN" && (
          <button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className="w-full rounded-xl sm:rounded-2xl bg-success text-success-foreground font-bold text-sm sm:text-base py-3.5 sm:py-4 min-h-[48px] sm:min-h-[56px] active:scale-[0.98] transition-transform disabled:opacity-60 touch-manipulation"
          >
            {isAccepting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Accepting...
              </span>
            ) : (
              "Accept This Leg"
            )}
          </button>
        )}
        {isAccepted && (
          <div className="flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-success/15 border border-success/30 py-3.5 sm:py-4 min-h-[48px] sm:min-h-[56px] text-success font-bold text-sm sm:text-base">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
            Accepted – Head to Pickup
          </div>
        )}
      </div>
    </div>
  )
}
