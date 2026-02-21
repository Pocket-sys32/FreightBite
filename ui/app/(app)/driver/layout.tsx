"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { createOAuthDriverSession, fetchCurrentDriver } from "@/lib/backend-api"
import { getSupabaseClient, hasSupabaseAuthConfig } from "@/lib/supabase-client"

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let active = true

    const validate = async () => {
      try {
        let driver = await fetchCurrentDriver()
        if (!driver && hasSupabaseAuthConfig()) {
          const supabase = getSupabaseClient()
          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (session?.user?.email) {
            driver = await createOAuthDriverSession({
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
            })
          }
        }

        if (!active) return
        if (!driver) {
          const next = pathname || "/driver"
          router.replace(`/auth?next=${encodeURIComponent(next)}`)
          return
        }

        setAllowed(true)
      } catch {
        if (!active) return
        const next = pathname || "/driver"
        router.replace(`/auth?next=${encodeURIComponent(next)}`)
      }
    }

    void validate()

    return () => {
      active = false
    }
  }, [pathname, router])

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your driver account...
      </div>
    )
  }

  return <>{children}</>
}
