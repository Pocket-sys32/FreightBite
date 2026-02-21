"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Truck,
  LayoutDashboard,
  Compass,
  Mail,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useState, useEffect } from "react"

const NAV_ITEMS = [
  { href: "/driver", label: "Loads", icon: LayoutDashboard },
  { href: "/driver/next", label: "Next", icon: Compass },
  { href: "/driver/email", label: "Outreach", icon: Mail },
]

export function AppNav() {
  const pathname = usePathname()
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    setOnline(navigator.onLine)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Truck className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">
            FreightBite
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href + "/"))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground active:bg-secondary"
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
            online ? "text-success" : "text-warning"
          )}>
            {online ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{online ? "Synced" : "Offline"}</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
            MT
          </div>
        </div>
      </div>
    </header>
  )
}
