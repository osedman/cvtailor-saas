"use client"

/**
 * The invite doorway — Figma "Tailr — Hiring Manager Concept", 01 · Hiring
 * manager → HM · Accept invite.
 *
 * A recruiter issued a raw-once token (§5.4) and emailed it to one address.
 * This page turns that token into hiring-manager access, and it can only do so
 * once the visitor has proved they own the mailbox it was sent to. Three
 * things follow from that, and all three are load-bearing:
 *
 * 1. ONE DEAD-LINK STATE. Unknown, revoked, expired, already used and
 *    orphaned all render the same sentence. /api/hiring/invite already
 *    collapses them to a single 404 and this page must not re-separate them —
 *    "that link expired" tells a stranger the token was real, which is the one
 *    bit they were fishing for.
 *
 * 2. THE ADDRESS IS ONLY EVER SHOWN MASKED. The server masks it before it
 *    leaves the database (m•••@meridian.nhs.uk). Whoever holds this URL has
 *    not proved they are the invitee — links get forwarded, pasted into Slack
 *    and read over shoulders. The mask is enough for the real invitee to
 *    recognise their own mailbox and not enough for anyone else to write to
 *    it. The same rule governs the mismatch state below.
 *
 * 3. SIGN-IN IS THE EXISTING ONE. No second auth path: this calls the same
 *    /api/auth/request-otp magic-link endpoint as the rest of Tailr, through
 *    the same AuthProvider wrapper, with `next` pointing back at this page so
 *    the link returns here to finish. One auth pool, three hats (§5.4) — the
 *    person signing in may already have a Tailr account, and they keep it.
 *
 * Light theme on purpose: this page never renders `.agd-main`, so it stays on
 * paper. The dark surface is the workspace, and they are not in it yet.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"

interface InvitePreview {
  agencyName: string
  company: string
  maskedEmail: string
}

type Lookup = "loading" | "dead" | "ready"
/** What the signed-in half of the page is doing. `mismatch` is terminal until
 * they sign in as somebody else. */
type Phase = "idle" | "accepting" | "mismatch"

const DEAD_TITLE = "This invite link isn't valid any more"
const DEAD_BODY =
  "Invitation links stop working once they have been used, once they expire, and the moment your recruiter revokes one. Ask them to send you a fresh link — it takes them a couple of seconds."

export default function HiringInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { user, loading: authLoading, signInWithEmail, signOut } = useAuth()

  const [lookup, setLookup] = useState<Lookup>("loading")
  const [invite, setInvite] = useState<InvitePreview | null>(null)

  const [phase, setPhase] = useState<Phase>("idle")
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)

  // Where the magic link comes back to. Same-origin relative path, which is
  // what /api/auth/request-otp will accept — it rejects anything else.
  const nextPath = `/hiring/invite/${encodeURIComponent(token)}`

  useEffect(() => {
    let live = true
    async function peek() {
      try {
        const res = await fetch(`/api/hiring/invite?token=${encodeURIComponent(token)}`)
        if (!live) return
        if (!res.ok) return setLookup("dead")
        const body = (await res.json()) as { invite?: InvitePreview }
        if (!live) return
        if (!body.invite) return setLookup("dead")
        setInvite(body.invite)
        setLookup("ready")
      } catch {
        // A network failure and a dead token look the same to the reader on
        // purpose; the retry advice below covers both.
        if (live) setLookup("dead")
      }
    }
    void peek()
    return () => {
      live = false
    }
  }, [token])

  const accept = useCallback(async () => {
    setPhase("accepting")
    setAcceptError(null)
    try {
      const res = await fetch("/api/hiring/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        router.push("/hiring")
        return
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string }
      if (res.status === 403 && body.reason === "email_mismatch") {
        setPhase("mismatch")
        return
      }
      if (res.status === 403) {
        // The invite died between the preview and the click.
        setLookup("dead")
        return
      }
      if (res.status === 401) {
        // Session expired mid-flow: fall back to the signed-out half.
        setPhase("idle")
        setAcceptError("Your session has expired. Sign in again to accept this invitation.")
        return
      }
      setPhase("idle")
      setAcceptError(body.error || "Something went wrong. Try again in a moment.")
    } catch {
      setPhase("idle")
      setAcceptError("Something went wrong. Check your connection and try again.")
    }
  }, [router, token])

  const requestLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!email) return
      setSending(true)
      setSignInError(null)
      const { error } = await signInWithEmail(email, { next: nextPath })
      setSending(false)
      if (error) setSignInError(error)
      else setSent(true)
    },
    [email, nextPath, signInWithEmail]
  )

  const verifyCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const otp = code.replace(/\s/g, "")
      if (!email || otp.length < 6) return
      setVerifying(true)
      setSignInError(null)
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" })
      if (error) {
        setSignInError(error.message || "That code didn't work. Try again or request a new link.")
        setVerifying(false)
        return
      }
      try {
        await fetch("/api/auth/post-login", { method: "POST" })
      } catch {
        /* the session is already set; this is bookkeeping */
      }
      setVerifying(false)
      // The AuthProvider picks the new session up and the signed-in half of
      // this page renders — no navigation, so the token never leaves the tab.
    },
    [code, email]
  )

  const startOver = useCallback(async () => {
    await signOut()
    setPhase("idle")
    setAcceptError(null)
    setSent(false)
    setCode("")
    setEmail("")
  }, [signOut])

  const busy = lookup === "loading" || (lookup === "ready" && authLoading)

  return (
    <main className="hm-door">
      <div className="ag-card hm-door-card">
        <div className="ag-card-body" style={{ padding: 28 }}>
          <div className="hm-door-mark">
            <div className="ag-brand-mark" aria-hidden="true">
              T
            </div>
            <div>
              <div className="ag-brand-name">Tailr</div>
              <div className="ag-brand-sub">Hiring manager</div>
            </div>
          </div>

          <div role="status" aria-live="polite" aria-busy={busy}>
            {busy && (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <span className="ag-spin" />
                <p className="ag-note" style={{ marginTop: 12 }}>
                  Checking this invitation.
                </p>
              </div>
            )}

            {/* ---- one dead-link state, for every failure mode ---- */}
            {!busy && lookup === "dead" && (
              <>
                <h1 className="ag-title" style={{ fontSize: "var(--t-title)" }}>
                  {DEAD_TITLE}
                </h1>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  {DEAD_BODY}
                </p>
              </>
            )}

            {/* ---- valid, signed in, wrong mailbox ---- */}
            {!busy && lookup === "ready" && invite && user && phase === "mismatch" && (
              <>
                <h1 className="ag-title" style={{ fontSize: "var(--t-title)" }}>
                  This invitation is for a different address
                </h1>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  {invite.agencyName} sent it to:
                </p>
                <p className="hm-masked" style={{ margin: "8px 0 14px" }}>
                  {invite.maskedEmail}
                </p>
                <p className="ag-note">
                  You are signed in as a different account, and access is only ever given to the
                  mailbox the invitation was sent to. Sign in with that address and open this link
                  again. If the masked address above is not one of yours, your recruiter has the
                  wrong contact details — tell them before using it.
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <button className="ag-btn ag-btn-coral" onClick={startOver}>
                    Sign out and use another address
                  </button>
                </div>
              </>
            )}

            {/* ---- valid, signed in, ready to bind ---- */}
            {!busy && lookup === "ready" && invite && user && phase !== "mismatch" && (
              <>
                <h1 className="ag-title" style={{ fontSize: "var(--t-title)" }}>
                  {invite.agencyName} invited you
                </h1>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  Accepting opens a workspace where you brief roles, offer interview times and
                  record your decisions for <b style={{ color: "var(--ag-ink)" }}>{invite.company}</b>
                  . Your recruiter can see everything you do there, and you can see none of their
                  working notes.
                </p>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  This invitation was issued to {invite.maskedEmail} — accepting checks that
                  against the address you are signed in with.
                </p>
                {acceptError && (
                  <p
                    className="ag-note"
                    role="alert"
                    style={{ marginTop: 12, color: "var(--ag-coral-deep)" }}
                  >
                    {acceptError}
                  </p>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <button
                    className="ag-btn ag-btn-coral"
                    onClick={accept}
                    disabled={phase === "accepting"}
                  >
                    {phase === "accepting" && <span className="ag-spin" />}
                    {phase === "accepting" ? "Accepting…" : "Accept and open my workspace"}
                  </button>
                  <button className="ag-btn ag-btn-secondary" onClick={startOver}>
                    Not me — sign out
                  </button>
                </div>
              </>
            )}

            {/* ---- valid, not signed in ---- */}
            {!busy && lookup === "ready" && invite && !user && (
              <>
                <h1 className="ag-title" style={{ fontSize: "var(--t-title)" }}>
                  {invite.agencyName} invited you
                </h1>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  They want you as the hiring manager for{" "}
                  <b style={{ color: "var(--ag-ink)" }}>{invite.company}</b>: briefing roles,
                  offering interview times and recording decisions in one place instead of a
                  thread.
                </p>
                <p className="ag-note" style={{ marginTop: 10 }}>
                  The invitation was sent to:
                </p>
                <p className="hm-masked" style={{ margin: "8px 0 16px" }}>
                  {invite.maskedEmail}
                </p>

                {sent ? (
                  <>
                    <p className="ag-card-title" style={{ margin: 0 }}>
                      Check your email
                    </p>
                    <p className="ag-note" style={{ marginTop: 6 }}>
                      We sent a sign-in link to that address. Open it on this device to come
                      straight back here — or type the 6-digit code from the same email below.
                    </p>
                    <form onSubmit={verifyCode} style={{ marginTop: 14 }}>
                      <label className="ag-label" htmlFor="hm-otp">
                        6-digit code
                      </label>
                      <input
                        id="hm-otp"
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
                      {signInError && (
                        <p
                          className="ag-note"
                          role="alert"
                          style={{ marginTop: 8, color: "var(--ag-coral-deep)" }}
                        >
                          {signInError}
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
                      The link and the code each work once and expire after about an hour. If
                      either fails, request a fresh one.
                    </p>
                    <button
                      className="ag-btn"
                      style={{ marginTop: 8, paddingLeft: 0, textDecoration: "underline" }}
                      onClick={() => {
                        setSent(false)
                        setCode("")
                        setSignInError(null)
                      }}
                    >
                      Use a different address
                    </button>
                  </>
                ) : (
                  <form onSubmit={requestLink}>
                    <label className="ag-label" htmlFor="hm-email">
                      Sign in with the invited address
                    </label>
                    <input
                      id="hm-email"
                      className="ag-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <p className="ag-note" style={{ marginTop: 6 }}>
                      No password. We email you a link, and you already have a Tailr account if
                      you have ever used it — signing in here does not create a second one.
                    </p>
                    {signInError && (
                      <p
                        className="ag-note"
                        role="alert"
                        style={{ marginTop: 8, color: "var(--ag-coral-deep)" }}
                      >
                        {signInError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="ag-btn ag-btn-coral"
                      style={{ marginTop: 14 }}
                      disabled={sending || !email}
                    >
                      {sending && <span className="ag-spin" />}
                      {sending ? "Sending…" : "Email me a sign-in link"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
