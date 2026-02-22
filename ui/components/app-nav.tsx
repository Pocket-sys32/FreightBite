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
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
        <Link href="/" className="flex items-center group">
          <Image
            src="/logo.svg"
            alt="FreightBite"
            width={56}
            height={56}
          />
        </Link>

        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && item.href !== "/driver" && pathname?.startsWith(item.href + "/"))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors min-h-[40px]",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium",
            online ? "text-success" : "text-warning"
          )}>
            {online ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
            {driverInitials}
          </div>
          <button
            onClick={handleLogout}
            className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
