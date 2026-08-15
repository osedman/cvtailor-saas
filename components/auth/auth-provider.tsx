"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface AuthContextValue {
  user: User | null
  loading: boolean
  signInWithEmail: (
    email: string,
    options?: { next?: string },
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signInWithEmail: async () => ({ error: null }),
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function signInWithEmail(email: string, options?: { next?: string }) {
    // Deliver via /api/auth/request-otp (Resend) — staging Supabase SMTP still
    // uses Resend's test From and returns "Error sending magic link email".
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: options?.next }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        return { error: body.error || "Error sending magic link email" }
      }
      return { error: null }
    } catch {
      return { error: "Error sending magic link email" }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    // The agency preference is httpOnly with a year on it, so signOut() alone
    // leaves one person's working context in the next person's browser.
    // Best-effort: the session is already gone either way.
    try {
      await fetch("/api/agency/session", { method: "DELETE" })
    } catch {
      /* nothing to recover — the sign-out itself succeeded */
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
