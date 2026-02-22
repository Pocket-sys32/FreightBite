"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Navigation,
  Compass,
  MessagesSquare,
  Bot,
  Wifi,
  WifiOff,
  LogOut,
} from "lucide-react"
import { useState, useEffect } from "react"
import { clearAuthToken, fetchCurrentDriver } from "@/lib/backend-api"
import { getSupabaseClient, hasSupabaseAuthConfig } from "@/lib/supabase-client"

const NAV_ITEMS = [
  { href: "/driver", label: "Loads", icon: LayoutDashboard },
  { href: "/driver/directions", label: "Directions", icon: Navigation },
  { href: "/driver/next", label: "Next", icon: Compass },
  { href: "/driver/outreach", label: "Outreach", icon: MessagesSquare },
  { href: "/driver/dispaich", label: "DispAIch", icon: Bot },
]

export function AppNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [online, setOnline] = useState(true)
  const [driverInitials, setDriverInitials] = useState("DR")

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

  useEffect(() => {
    let active = true
    const loadDriver = async () => {
      const driver = await fetchCurrentDriver()
      if (!active || !driver) return
      const initials = driver.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
      setDriverInitials(initials || "DR")
    }
    void loadDriver()
    return () => {
      active = false
    }
  }, [])

  const handleLogout = async () => {
    if (hasSupabaseAuthConfig()) {
      try {
        await getSupabaseClient().auth.signOut()
      } catch {
        // no-op
      }
    }
    clearAuthToken()
    router.push("/auth")
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-12 min-h-[44px] max-w-3xl items-center justify-between gap-1 px-3 sm:h-14 sm:px-5 min-w-0">
        <Link href="/" className="flex shrink-0 items-center group min-h-[44px]">
          <Image
            src="/logo.svg"
            alt="FreightBite"
            width={56}
            height={56}
            className="h-9 w-auto sm:h-14"
          />
        </Link>

        <nav className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto overflow-y-hidden py-1 [-webkit-overflow-scrolling:touch]">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && item.href !== "/driver" && pathname?.startsWith(item.href + "/"))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors min-h-[44px] min-w-[44px] touch-manipulation sm:min-w-0 sm:px-3",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-secondary"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className={cn(
            "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg sm:min-w-0 sm:px-2 text-xs font-medium",
            online ? "text-success" : "text-warning"
          )}>
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </div>
          <div className="hidden h-8 w-8 shrink-0 rounded-lg bg-secondary items-center justify-center text-xs font-bold text-foreground sm:flex">
            {driverInitials}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-8 min-h-[44px] w-8 min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
