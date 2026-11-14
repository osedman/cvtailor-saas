"use client"

/**
 * Two-step verification — set it up, or pass it for this sign-in.
 *
 * Built to the Figma frame "Admin — Two-step verification setup (560)"
 * (figma.com/design/PyzSuQcvilrl80EjFrUP73, 13:198).
 *
 * Two situations share the screen:
 *   - never set up: show the QR code, take the first code, and the session
 *     is raised to two-step in the same move
 *   - set up before, but this sign-in has not passed it yet: just the code
 *
 * This talks to Supabase Auth directly from the browser (enrol, challenge,
 * verify) — the factor belongs to the signed-in person and no Tailr route
 * needs to see the secret. The server's only part is reading the resulting
 * assurance level off the session (lib/admin-access.ts).
 */
import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAdmin } from "@/components/admin/admin-shell"
import { ROLE_LABELS } from "@/lib/admin-activity-text"
import { safeNextPath } from "@/lib/auth-paths"
import { createClient } from "@/lib/supabase/client"

type Stage =
  | { kind: "loading" }
  | { kind: "enrol"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "failed"; message: string }

/** "ABCDEFGH" → "ABCD EFGH": readable when typed by hand, no mono needed. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim()
}

function TwoStep() {
  const { me, refresh } = useAdmin()
  const router = useRouter()
  const next = safeNextPath(useSearchParams().get("next")) ?? "/admin"
  const [stage, setStage] = useState<Stage>({ kind: "loading" })
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const done = me.twoStep
  const notNeeded = !me.needsTwoStep

  useEffect(() => {
    if (done || notNeeded || started.current) return
    started.current = true
    void (async () => {
      const supabase = createClient()
      try {
        const { data, error: listErr } = await supabase.auth.mfa.listFactors()
        if (listErr) throw listErr
        const verified = data.totp[0]
        if (verified) return setStage({ kind: "challenge", factorId: verified.id })

        // An abandoned setup leaves an unverified factor behind, and a second
        // one cannot be created beside it. Clear those first.
        for (const f of data.all) {
          if (f.factor_type === "totp" && f.status === "unverified") {
            await supabase.auth.mfa.unenroll({ factorId: f.id })
          }
        }
        const { data: enrolled, error: enrolErr } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Tailr admin",
        })
        if (enrolErr) throw enrolErr
        setStage({ kind: "enrol", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret })
      } catch (e) {
        console.error("[admin/two-step]", e)
        setStage({ kind: "failed", message: "Two-step setup could not start. Try again, or sign out and back in." })
      }
    })()
  }, [done, notNeeded])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (stage.kind !== "enrol" && stage.kind !== "challenge") return
    setError(null)
    const digits = code.replace(/\D/g, "")
    if (digits.length !== 6) return setError("Enter the 6-digit code from your authenticator app.")
    setBusy(true)
    try {
      const supabase = createClient()
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: digits })
      if (verifyErr) {
        setCode("")
        return setError("That code didn’t match. Check the app for a new one and try again.")
      }
      // Verify the effect: the server must now see a two-step session.
      await refresh()
      toast.success(stage.kind === "enrol" ? "Two-step verification is on" : "Verified")
      router.replace(next)
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const backLink = (
    <Link href={next === "/admin/two-step" ? "/admin" : next} className="ns-admin-btn mt-3.5">Back to dashboards</Link>
  )

  if (notNeeded || done) {
    return (
      <main className="mx-auto max-w-[560px] px-4 py-8 sm:px-10 sm:py-10">
        <div className="t-eyebrow" style={{ fontSize: 10.5 }}>Admin · Security</div>
        <h1 className="t-title mt-3.5 text-[26px]">
          {done ? "Two-step verification is on" : "Nothing to set up"}
          <span style={{ color: "var(--ns-coral)" }}>.</span>
        </h1>
        <p className="mt-3.5 text-[12.5px] leading-[1.5] text-[#5c534c]">
          {done
            ? "This sign-in has passed the second step, so you can make changes."
            : "Your Viewer role only reads the dashboards, so it doesn’t need a second step."}
        </p>
        {backLink}
      </main>
    )
  }

  const enrolling = stage.kind === "enrol"
  return (
    <main className="mx-auto max-w-[560px] px-4 py-8 sm:px-10 sm:py-10">
      <div className="t-eyebrow" style={{ fontSize: 10.5 }}>Admin · Security</div>
      <h1 className="t-title mt-3.5 text-[26px]">
        {stage.kind === "challenge" ? "Enter your two-step code" : "Turn on two-step verification"}
        <span style={{ color: "var(--ns-coral)" }}>.</span>
      </h1>
      <p className="mt-3.5 text-[12.5px] leading-[1.5] text-[#5c534c]">
        {stage.kind === "challenge"
          ? `Your ${ROLE_LABELS[me.role]} role can change other people’s accounts, so each sign-in needs the code from your authenticator app before you can make changes.`
          : `Your ${ROLE_LABELS[me.role]} role can change other people’s accounts, so it needs a second step when you sign in. Until this is on, you can read the dashboards but not make changes.`}
      </p>

      {stage.kind === "loading" && (
        <div className="flex justify-center py-14" role="status" aria-label="Preparing two-step setup">
          <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
        </div>
      )}

      {stage.kind === "failed" && (
        <div className="ns-admin-panel mt-3.5 flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
          <p className="text-[12px] font-medium text-[#b3341b]">{stage.message}</p>
          <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => window.location.reload()}>Try again</button>
        </div>
      )}

      {(enrolling || stage.kind === "challenge") && (
        <form onSubmit={verify} className="ns-admin-card mt-3.5 flex flex-col gap-3.5 p-[18px]" noValidate>
          {enrolling && (
            <>
              <p className="text-[13px] font-medium">1. Scan this code with an authenticator app</p>
              {/* Supabase returns the QR as an SVG data URI; a plain img is right for it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stage.qr} alt="QR code for your authenticator app" width={148} height={148}
                className="h-[148px] w-[148px] rounded-lg border border-[#eee6da] bg-white p-1.5" />
              <p className="break-words text-[11.5px] leading-[1.5] text-[#5c534c]">
                Can’t scan? Enter this key instead:{" "}
                <span className="inline-block select-all whitespace-nowrap font-semibold tracking-[0.08em] text-[#1e1813]">{groupSecret(stage.secret)}</span>
              </p>
            </>
          )}
          <p className="text-[13px] font-medium">
            {enrolling ? "2. Enter the 6-digit code it shows" : "Enter the 6-digit code from your authenticator app"}
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="sm:w-[160px]">
              <label htmlFor="two-step-code" className="ns-admin-label">Code</label>
              <input id="two-step-code" className="ns-admin-input tracking-[0.2em]" inputMode="numeric"
                autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} placeholder="123456"
                value={code} disabled={busy} autoFocus={stage.kind === "challenge"}
                aria-describedby={error ? "two-step-error" : undefined} aria-invalid={!!error}
                onChange={(e) => setCode(e.target.value)} />
            </div>
            <button type="submit" className="ns-admin-btn ns-admin-btn-primary" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {enrolling ? "Turn on two-step" : "Verify"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div id="two-step-error" role="alert" className="ns-admin-panel mt-3.5 px-3.5 py-2.5">
          <p className="text-[12px] font-medium leading-[1.5] text-[#b3341b]">{error}</p>
        </div>
      )}

      {backLink}
    </main>
  )
}

export default function AdminTwoStepPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={null}>
      <TwoStep />
    </Suspense>
  )
}
