"use client"

/**
 * Consumer settings — the two opt-ins.
 *
 * Built to the signed-off Figma frame "Consumer · Settings — matching opt-in"
 * (file AWRRbEOX6rLsltutFDL3zs, page "03 · Consumer job board", node 109:2),
 * which sits beside the match recommendation it leads to.
 *
 * The design decision this screen exists to carry: they are TWO switches
 * because they are two questions. Consent to having your evidence support an
 * application you already made does not contain consent to being discovered
 * for roles you never applied to. Neither is on by default, neither is
 * pre-selected, and neither turns the other on.
 *
 * Every promise in this copy is one the schema keeps:
 * — "shown only to you" is `published_roles`' RLS policy, not a rule anyone
 *   has to remember.
 * — "a rounded count, never who" is `agency.role_matching.matched_bucket`,
 *   which is floored so one is indistinguishable from four.
 * — "does not un-send an application" is the append-only `applied` state,
 *   which the database refuses to reverse.
 * If any of those change, this copy is wrong and must change with them.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { ConsentSubject } from "@/lib/matching/limits"

interface ConsentEvent {
  subject: ConsentSubject
  action: "granted" | "withdrawn"
  copyVersion: string
  createdAt: string
}

interface ConsentState {
  matching: boolean
  enrichment: boolean
  matchingSince: string | null
  enrichmentSince: string | null
  history: ConsentEvent[]
}

const PROMISES = [
  "The scan runs on your side. Agencies never browse or search Tailr users.",
  "A role that matches you is shown only to you. The agency is told a rounded count, never who.",
  "Applying is the moment anything is shared — for that one role, and you can withdraw it.",
]

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function Switch({
  checked,
  busy,
  label,
  onChange,
}: {
  checked: boolean
  busy: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex flex-none items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        className="ns-switch"
        onClick={() => onChange(!checked)}
      />
      <span
        className="t-mono"
        style={{ minWidth: 26, textTransform: "uppercase" }}
        aria-hidden="true"
      >
        {busy ? "…" : checked ? "On" : "Off"}
      </span>
    </div>
  )
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState<ConsentState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ConsentSubject | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/matching/preferences")
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Could not load your settings.")
      setState(data as ConsentState)
    } catch (err) {
      // A failed load must not read as an empty one — an unset switch and an
      // unreachable server look identical otherwise, and one of those is a
      // statement about consent.
      setError(err instanceof Error ? err.message : String(err))
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user) void load()
    else if (!authLoading) setLoading(false)
  }, [authLoading, user, load])

  const change = useCallback(
    async (subject: ConsentSubject, granted: boolean) => {
      setBusy(subject)
      try {
        const res = await fetch("/api/matching/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, granted }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "That did not save.")
        setState(data as ConsentState)
        toast.success(
          granted
            ? subject === "matching"
              ? "Roles can find you now."
              : "Your evidence can support applications you make."
            : "Turned off. Nothing further will be shared."
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(null)
      }
    },
    []
  )

  if (!authLoading && !user) {
    return (
      <div className="ns min-h-screen">
        <Header />
        <main className="mx-auto max-w-3xl px-5 py-16">
          <p className="t-eyebrow">Your account</p>
          <h1 className="t-title mt-2 text-3xl">Settings</h1>
          <p className="t-lede mt-3">Sign in to manage how Tailr uses your evidence.</p>
          <a className="ns-btn ns-btn-primary mt-6" href="/login?next=%2Fsettings">
            Sign in
          </a>
        </main>
      </div>
    )
  }

  return (
    <div className="ns min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="t-eyebrow">Your account</p>
        <h1 className="t-title mt-2 text-3xl">Settings</h1>
        <p className="t-lede mt-3 max-w-[62ch]">
          Two separate switches, because they are two separate questions. Neither is on unless
          you turn it on, and turning either off takes effect immediately.
        </p>

        {loading && (
          <div className="mt-10 flex items-center gap-2" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="t-small">Loading your settings…</span>
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            className="mt-8 rounded-xl border p-4"
            style={{ borderColor: "var(--ns-coral)", background: "var(--ns-tint-1)" }}
          >
            <p className="t-body" style={{ color: "var(--ns-coral-deep)" }}>
              {error}
            </p>
            <button className="ns-btn ns-btn-secondary mt-3" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {state && !loading && (
          <>
            {/* ── Quiet matching ─────────────────────────────────── */}
            <section
              className="mt-8 rounded-2xl border p-6"
              style={{ background: "#fff", borderColor: "var(--ns-border)" }}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="t-eyebrow t-eyebrow-quiet">Quiet matching</p>
                  <h2 className="t-title mt-1.5 text-xl">Let roles find me</h2>
                  <p className="t-body mt-2 max-w-[64ch]" style={{ color: "var(--ns-ink-70)" }}>
                    Tailr checks live roles against your evidence bank and tells you when one
                    fits. The check runs on your side — no agency browses Tailr users, and
                    nobody sees you unless you choose to apply.
                  </p>
                </div>
                <Switch
                  checked={state.matching}
                  busy={busy === "matching"}
                  label="Let roles find me"
                  onChange={(next) => void change("matching", next)}
                />
              </div>

              <ul className="mt-5 space-y-2">
                {PROMISES.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5"
                    style={{ background: "#fdfcf9", borderColor: "var(--ns-border)" }}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-[5px] w-[5px] flex-none rounded-full"
                      style={{ background: "var(--ns-coral)" }}
                    />
                    <span className="t-small" style={{ color: "var(--ns-ink-70)" }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="t-small mt-4">
                Turning this on records the date and the wording you agreed to. Turning it off
                stops the scan and expires anything already found — it does not un-send an
                application you chose to make.
                {state.matching && state.matchingSince && (
                  <> On since {formatDate(state.matchingSince)}.</>
                )}
              </p>
            </section>

            {/* ── Enrichment ─────────────────────────────────────── */}
            <section
              className="mt-6 rounded-2xl border p-6"
              style={{ background: "#fff", borderColor: "var(--ns-border)" }}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="t-eyebrow t-eyebrow-quiet">When you have already applied</p>
                  <h2 className="t-title mt-1.5 text-xl">
                    Show my evidence to a recruiter who already has my CV
                  </h2>
                  <p className="t-body mt-2 max-w-[64ch]" style={{ color: "var(--ns-ink-70)" }}>
                    A different question, so a different switch. This one changes nothing about
                    being found — it only means that when a recruiter is already holding your
                    application, the evidence you have banked here can support it.
                  </p>
                </div>
                <Switch
                  checked={state.enrichment}
                  busy={busy === "enrichment"}
                  label="Show my evidence to a recruiter who already has my CV"
                  onChange={(next) => void change("enrichment", next)}
                />
              </div>
              <p className="t-small mt-4">
                Neither switch turns the other on. Neither is on by default.
                {state.enrichment && state.enrichmentSince && (
                  <> On since {formatDate(state.enrichmentSince)}.</>
                )}
              </p>
            </section>

            {/* ── The record ─────────────────────────────────────── */}
            <section
              className="mt-6 rounded-xl border p-5"
              style={{ background: "var(--ns-tint-1)", borderColor: "var(--ns-tint-2)" }}
            >
              <p className="t-eyebrow">Your record</p>
              <p className="t-small mt-2 max-w-[74ch]">
                Every time you change either switch we keep the date and the exact wording you
                agreed to. A flag on its own cannot answer &ldquo;when did I agree, and to
                what?&rdquo; — so we do not keep one.
              </p>

              {state.history.length > 0 ? (
                <ul className="mt-4 space-y-1.5">
                  {state.history.map((e, i) => (
                    <li key={`${e.createdAt}-${i}`} className="t-mono">
                      {formatDate(e.createdAt)} · {e.subject === "matching" ? "matching" : "enrichment"}{" "}
                      · {e.action} · {e.copyVersion}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-small mt-3" style={{ color: "var(--ns-ink-40)" }}>
                  Nothing to show yet — you have not changed either switch.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
