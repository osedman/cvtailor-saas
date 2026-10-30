"use client"

/**
 * Sign out — the control that was missing from every agency screen.
 *
 * signOut() has always done the right thing (it clears the Supabase session
 * AND the httpOnly agency cookie, so one person's working context does not
 * outlive them in a shared browser). It was simply never surfaced anywhere in
 * /agencies or /hiring: the only way out was clearing cookies by hand.
 *
 * Found in Ose's walk-through, 22 Aug. It matters beyond tidiness — agency
 * desks are shared, and a recruiter who cannot hand the machine over is a
 * recruiter whose session someone else inherits.
 *
 * Confirms first. An accidental sign-out costs a magic-link round trip
 * through an inbox, which is a genuinely annoying way to lose your place.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"

export function SignOut({ email, door = "business" }: { email?: string | null; door?: "business" | "consumer" }) {
  const { signOut } = useAuth()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    await signOut()
    // Back to the door they came through, so the next person signs in where
    // they expect to rather than landing on the consumer product.
    router.push(door === "business" ? "/agencies/sign-in" : "/login")
    router.refresh()
  }

  return (
    <div className="ag-signout">
      {email && (
        <div className="ag-signout-who" title={email}>
          {email}
        </div>
      )}
      {confirming ? (
        <div className="ag-signout-confirm">
          <button className="ag-btn ag-btn-primary ag-signout-go" onClick={go} disabled={busy}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
          <button className="ag-btn ag-signout-cancel" onClick={() => setConfirming(false)} disabled={busy}>
            Stay
          </button>
        </div>
      ) : (
        <button className="ag-btn ag-signout-trigger" onClick={() => setConfirming(true)}>
          Sign out
        </button>
      )}
    </div>
  )
}
