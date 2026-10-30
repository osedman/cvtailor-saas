"use client"

/**
 * The business front door.
 *
 * One auth engine, two faces (docs/AGENCIES_SCHEMA.md §5.4 amended 14 Aug):
 * this posts to the same /api/auth/request-otp and verifies the same way as
 * the consumer door at /login — it is the branding, the copy and the landing
 * that differ, never the mechanism. A person may hold a consumer hat and a
 * recruiter hat on one auth.users row; signing in here does not create a
 * second account and does not grant anything. Hats are re-checked against the
 * database after the session exists.
 *
 * It lives under /agencies so the proxy already treats it as a business path
 * and the agencies layout already supplies the design system. It deliberately
 * does NOT render `.agd-main`, so it stays on light paper: this is a doorway,
 * not the workspace.
 */

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { AGENCY_LANDING, safeNextPath } from "@/lib/auth-paths"

function SignInInner() {
  const { user, loading, signInWithEmail } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get("next")) ?? AGENCY_LANDING

  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in: this door has nothing to ask.
  useEffect(() => {
    if (!loading && user) router.replace(next)
  }, [user, loading, next, router])

  const requestLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!email) return
      setSending(true)
      setError(null)
      const { error } = await signInWithEmail(email, { next })
      setSending(false)
      if (error) setError(error)
      else setSent(true)
    },
    [email, next, signInWithEmail]
  )

  const verifyCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const otp = code.replace(/\s/g, "")
      if (!email || otp.length < 6) return
      setVerifying(true)
      setError(null)
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" })
      if (error) {
        setError(error.message || "That code didn't work. Try again or request a new link.")
        setVerifying(false)
        return
      }
      try {
        await fetch("/api/auth/post-login", { method: "POST" })
      } catch {
        /* the session is already set; this is bookkeeping */
      }
      setVerifying(false)
      router.replace(next)
    },
    [code, email, next, router]
  )

  const busy = loading || Boolean(user)

  return (
    <main className="ag-door">
      <div className="ag-card ag-door-card">
        <div className="ag-card-body" style={{ padding: 28 }}>
          <div className="ag-door-mark">
            <div className="ag-brand-mark" aria-hidden="true">
              T
            </div>
            <div>
              <div className="ag-brand-name">Tailr</div>
              <div className="ag-brand-sub">For agencies</div>
            </div>
          </div>

          <div role="status" aria-live="polite" aria-busy={busy}>
            {busy ? (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <span className="ag-spin" />
              </div>
            ) : sent ? (
              <>
                <h1 className="ag-title" style={{ fontSize: "var(--t-title)" }}>
                  Check your email
                </h1>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  We sent a sign-in link to <b style={{ color: "var(--ag-ink)" }}>{email}</b>. Open
                  it on this device to come straight back here — or type the code from the
                  same email below.
                </p>
                <form onSubmit={verifyCode} style={{ marginTop: 14 }}>
                  <label className="ag-label" htmlFor="ag-otp">
                    Code from the email
                  </label>
                  <input
                    id="ag-otp"
                    className="ag-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={8}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    style={{ letterSpacing: "0.3em", textAlign: "center" }}
                  />
                  {error && (
                    <p
                      className="ag-note"
                      role="alert"
                      style={{ marginTop: 8, color: "var(--ag-coral-deep)" }}
                    >
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="ag-btn ag-btn-coral"
                    style={{ marginTop: 12 }}
                    disabled={verifying || code.replace(/\s/g, "").length < 6}
                  >
                    {verifying && <span className="ag-spin" />}
                    {verifying ? "Verifying…" : "Verify code"}
                  </button>
                </form>
                <p className="ag-note" style={{ marginTop: 14 }}>
                  The link and the code each work once and expire after about an hour. If either
                  fails, request a fresh one.
                </p>
                <button
                  className="ag-btn"
                  style={{ marginTop: 8, paddingLeft: 0, textDecoration: "underline" }}
                  onClick={() => {
                    setSent(false)
                    setCode("")
                    setError(null)
                  }}
                >
                  Use a different address
                </button>
              </>
            ) : (
              <>
                <h1 className="ag-title" style={{ fontSize: "var(--t-title)" }}>
                  Sign in
                </h1>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  For recruiters and hiring managers. You will land in whichever workspace your
                  account has been given — your agency, or the client side of it.
                </p>
                <form onSubmit={requestLink} style={{ marginTop: 16 }}>
                  <label className="ag-label" htmlFor="ag-email">
                    Work email
                  </label>
                  <input
                    id="ag-email"
                    className="ag-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    placeholder="you@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="ag-note" style={{ marginTop: 6 }}>
                    No password. We email you a link. If you already use Tailr for your own career,
                    that is the same account and signing in here does not create a second one —
                    the two sides stay separate.
                  </p>
                  {error && (
                    <p
                      className="ag-note"
                      role="alert"
                      style={{ marginTop: 8, color: "var(--ag-coral-deep)" }}
                    >
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="ag-btn ag-btn-coral"
                    style={{ marginTop: 12 }}
                    disabled={sending || !email}
                  >
                    {sending && <span className="ag-spin" />}
                    {sending ? "Sending…" : "Email me a link"}
                  </button>
                </form>
                <p className="ag-note" style={{ marginTop: 16 }}>
                  Access is granted by your agency, never claimed. If nobody has invited you yet,
                  signing in will tell you so rather than guessing.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default function AgencySignInPage() {
  return (
    <Suspense
      fallback={
        <main className="ag-door">
          <div className="ag-card ag-door-card">
            <div className="ag-card-body" style={{ padding: 28, textAlign: "center" }}>
              <span className="ag-spin" />
            </div>
          </div>
        </main>
      }
    >
      <SignInInner />
    </Suspense>
  )
}
