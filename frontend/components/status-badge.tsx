import { cn } from "@/lib/utils"
import type { LegStatus } from "@/lib/mock-data"

const STATUS_CONFIG: Record<
  LegStatus,
  { label: string; className: string; dotClassName: string; pulse: boolean }
> = {
  OPEN: {
    label: "Open",
    className: "bg-secondary text-muted-foreground",
    dotClassName: "bg-muted-foreground",
    pulse: false,
  },
  ASSIGNED: {
    label: "Assigned",
    className: "bg-primary/10 text-primary",
    dotClassName: "bg-primary",
    pulse: false,
  },
  IN_TRANSIT: {
    label: "In Transit",
    className: "bg-success/10 text-success",
    dotClassName: "bg-success",
    pulse: true,
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-success/10 text-success",
    dotClassName: "bg-success",
    pulse: false,
  },
  SEARCHING: {
    label: "Searching",
    className: "bg-warning/10 text-warning",
    dotClassName: "bg-warning",
    pulse: true,
  },
}

export function StatusBadge({ status }: { status: LegStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
        config.className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", config.dotClassName)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", config.dotClassName)} />
      </span>
      {config.label}
    </span>
  )
}
