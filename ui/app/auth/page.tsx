"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, Loader2, ShieldCheck, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createOAuthDriverSession } from "@/lib/backend-api"
import { getSupabaseClient, hasSupabaseAuthConfig } from "@/lib/supabase-client"

export default function AuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") || "/driver"
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncSession = useCallback(async () => {
    if (!hasSupabaseAuthConfig()) {
      setError("OAuth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabaseClient()
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) throw sessionError

      if (!session?.user?.email) {
        setLoading(false)
        return
      }

      await createOAuthDriverSession({
        email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
      })

      router.replace(nextPath)
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "OAuth sign-in failed"
      setError(message)
      setLoading(false)
    }
  }, [nextPath, router])

  useEffect(() => {
    void syncSession()
  }, [syncSession])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setError(null)

    try {
      const supabase = getSupabaseClient()
      const redirectTo = `${window.location.origin}/auth?next=${encodeURIComponent(nextPath)}`
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      })
      if (oauthError) throw oauthError
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Failed to start OAuth"
      setError(message)
      setSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">FreightBite</p>
            <h1 className="text-xl font-semibold text-foreground">Sign in with OAuth</h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Driver accounts now use OAuth through Supabase Auth. No password form is used here.
        </p>

        {loading ? (
          <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking existing OAuth session...
          </div>
        ) : (
          <Button onClick={handleGoogleSignIn} disabled={signingIn} className="w-full gap-2">
            {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Continue with Google
          </Button>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
