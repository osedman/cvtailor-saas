"use client"

/**
 * A role found you — built to Figma "Consumer · Match recommendation"
 * (file AWRRbEOX6rLsltutFDL3zs, page 03 · Consumer job board, node 13:2).
 *
 * The frame's copy is load-bearing and tested: "a recommendation, not a
 * listing", "nothing is shared unless you apply", "dismissing shares
 * nothing", "same list the recruiter uses". Each of those lines is a promise
 * the schema keeps (SELECT-own RLS, the apply-only wall, the dismissed state
 * the scan will not overwrite, the shared assessment module), so if the
 * schema changes the copy must change with it — and vice versa.
 *
 * Tailor and Apply render DISABLED with a title saying why, per the repo
 * precedent ("Fill from transcript"): the apply route — consent event first,
 * itemised disclosure manifest, the bundle crossing the wall — does not exist
 * yet, and a control whose backend does not exist must say so rather than
 * pretend.
 *
 * The score displays as "N% match before tailoring" — the unreviewed,
 * un-overridden number, same as the recruiter's threshold means. MISSING
 * requirements render explicitly; they are the honest gaps, not noise.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { FoundRole } from "@/lib/matching/found"

const HOW_IT_WORKS = [
  "There is no job board — roles come to you, matched on your evidence.",
  "The scan runs on your side. Agencies never browse Tailr users.",
  "Apply and only then does the agency see you — pre-evidenced, this role only.",
]

const WEIGHT_LABEL: Record<string, string> = {
  must: "MUST ×3.0",
  important: "IMPORTANT ×2.0",
  nice: "NICE ×1.0",
}

function StrengthNote({ strength, quote }: { strength: string; quote: string | null }) {
  if (strength === "missing" || !quote) {
    return (
      <p className="t-mono mt-1" style={{ color: "var(--ns-coral-deep)" }}>
        you: MISSING — nothing in your bank for this yet
      </p>
    )
  }
  return (
    <div className="mt-1">
      <p className="t-mono" style={{ color: "var(--ns-ink)" }}>
        you: {strength.toUpperCase()}
      </p>
      {/* Their own words, verbatim — the quote is the reason this role found
          them, so it renders in full rather than as a teaser. */}
      <blockquote
        className="t-quote mt-1 rounded-lg border px-3 py-2"
        style={{ background: "#fdfcf9", borderColor: "var(--ns-border)" }}
      >
        “{quote}”
      </blockquote>
    </div>
  )
}

export default function FoundPage() {
  const { user, loading: authLoading } = useAuth()
  const [found, setFound] = useState<FoundRole[] | null>(null)
  const [matchingOn, setMatchingOn] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seenSent = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/found")
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Could not load this page.")
      setFound(data.found as FoundRole[])
      setMatchingOn(Boolean(data.matchingOn))
      const first = (data.found as FoundRole[]).find((f) => f.state !== "dismissed")
      setSelected((prev) => prev ?? first?.id ?? null)
    } catch (err) {
      // A failed load must not read as an empty one — "nothing found you" is
      // a statement about the person's job search, and it had better be true.
      setError(err instanceof Error ? err.message : String(err))
      setFound(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user) void load()
    else if (!authLoading) setLoading(false)
  }, [authLoading, user, load])

  // Looking at a recommendation lifts new → seen, once, fire-and-forget.
  // The trigger stamps seen_at; failure costs nothing but staleness.
  useEffect(() => {
    if (!selected || !found) return
    const rec = found.find((f) => f.id === selected)
    if (!rec || rec.state !== "new" || seenSent.current.has(rec.id)) return
    seenSent.current.add(rec.id)
    void fetch(`/api/found/${rec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "seen" }),
    }).catch(() => {})
  }, [selected, found])

  const dismiss = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/found/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "dismissed" }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "That did not save.")
        toast.success("Dismissed. Nothing was shared with anyone.")
        setSelected(null)
        void load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [load]
  )

  const active = found?.find((f) => f.id === selected) ?? null
  const open = (found ?? []).filter((f) => f.state === "new" || f.state === "seen")
  const isLive = active?.role.status === "live"

  if (!authLoading && !user) {
    return (
      <div className="ns min-h-screen">
        <Header />
        <main className="mx-auto max-w-3xl px-5 py-16">
          <p className="t-eyebrow">While you were working your path</p>
          <h1 className="t-title mt-2 text-3xl">A role found you</h1>
          <p className="t-lede mt-3">Sign in to see roles matched against your evidence.</p>
          <a className="ns-btn ns-btn-primary mt-6" href="/login?next=%2Ffound">
            Sign in
          </a>
        </main>
      </div>
    )
  }

  return (
    <div className="ns min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <p className="t-eyebrow">While you were working your path</p>
        <h1 className="t-title mt-2 text-3xl">A role found you</h1>
        <p className="t-lede mt-3 max-w-[62ch]">
          Tailr matched a live role against your evidence bank — on your side, in your app.
          Nobody has seen your profile, and nothing is shared unless you apply.
        </p>

        {loading && (
          <div className="mt-10 flex items-center gap-2" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="t-small">Checking what found you…</span>
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

        {found && !loading && open.length === 0 && (
          <div
            className="mt-8 rounded-2xl border p-6"
            style={{ background: "#fff", borderColor: "var(--ns-border)" }}
          >
            <h2 className="t-title text-xl">Nothing yet — and that is normal.</h2>
            <p className="t-body mt-2 max-w-[64ch]" style={{ color: "var(--ns-ink-70)" }}>
              {matchingOn
                ? "Matching is on. When a live role scores against your evidence, it appears here — only to you. The richer your evidence bank, the more there is to match."
                : "Matching is off, so no role can find you. Turn it on in Settings if you want them to."}
            </p>
            {!matchingOn && (
              <Link className="ns-btn ns-btn-secondary mt-4" href="/settings">
                Open Settings
              </Link>
            )}
          </div>
        )}

        {found && !loading && open.length > 0 && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
            {/* ── left: the recommendations, and how this works ───── */}
            <div className="space-y-4">
              {open.map((rec) => (
                <button
                  key={rec.id}
                  className="ns-card w-full rounded-2xl border p-5 text-left"
                  style={{
                    background: rec.id === selected ? "var(--ns-tint-1)" : "#fff",
                    borderColor: rec.id === selected ? "var(--ns-coral)" : "var(--ns-border)",
                  }}
                  onClick={() => setSelected(rec.id)}
                  aria-pressed={rec.id === selected}
                >
                  <p className="t-eyebrow">
                    Recommended · {Math.round(rec.score)}% match before tailoring
                  </p>
                  <h2 className="t-title mt-1.5 text-lg">{rec.role.title}</h2>
                  <p className="t-small mt-1">
                    {rec.role.company || "Confidential"} · via {rec.role.agencyName}
                    {rec.role.salaryBand ? ` · ${rec.role.salaryBand}` : ""}
                    {rec.role.location ? ` · ${rec.role.location}` : ""}
                  </p>
                </button>
              ))}

              <div
                className="rounded-2xl border p-5"
                style={{ background: "#fff", borderColor: "var(--ns-border)" }}
              >
                <p className="t-eyebrow t-eyebrow-quiet">How matching works</p>
                <ul className="mt-3 space-y-2">
                  {HOW_IT_WORKS.map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-[5px] w-[5px] flex-none rounded-full"
                        style={{ background: "var(--ns-coral)" }}
                      />
                      <span className="t-small">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── right: the role, in full ────────────────────────── */}
            {active && (
              <article
                className="rounded-2xl border p-6 sm:p-8"
                style={{ background: "#fff", borderColor: "var(--ns-border)" }}
              >
                <p className="t-eyebrow">Only you can see this — a recommendation, not a listing</p>
                <p className="t-mono mt-2">
                  {(active.role.company || "Confidential").toUpperCase()} · VIA{" "}
                  {active.role.agencyName.toUpperCase()}
                </p>
                <h2 className="t-display mt-1 text-3xl">{active.role.title}</h2>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[active.role.salaryBand, active.role.location, active.role.seniority]
                    .filter(Boolean)
                    .map((chip) => (
                      <span key={chip} className="ns-chip ns-chip-have">
                        {chip}
                      </span>
                    ))}
                  <span
                    className="ns-chip"
                    style={
                      isLive
                        ? { background: "var(--ns-tint-1)", color: "var(--ns-coral-deep)", border: "1px solid var(--ns-tint-2)" }
                        : { background: "var(--ns-cream)", color: "var(--ns-ink-55)", border: "1px solid var(--ns-border)" }
                    }
                  >
                    {isLive ? "Live role" : "No longer live"}
                  </span>
                </div>

                {active.role.summary && (
                  <p className="t-body mt-4 max-w-[70ch]" style={{ color: "var(--ns-ink-70)" }}>
                    {active.role.summary}
                  </p>
                )}

                <p className="t-eyebrow t-eyebrow-quiet mt-8">
                  What they&apos;ll score you on — same list the recruiter uses
                </p>
                <ul className="mt-3 space-y-3">
                  {active.requirements.map((req) => (
                    <li
                      key={req.ref}
                      className="rounded-xl border px-4 py-3"
                      style={{ background: "#fdfcf9", borderColor: "var(--ns-border)" }}
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="t-mono flex-none">{WEIGHT_LABEL[req.weight] ?? req.weight}</span>
                        <span className="t-body">{req.text}</span>
                      </div>
                      <StrengthNote strength={req.strength} quote={req.quote} />
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-8 rounded-2xl border p-5 sm:p-6"
                  style={{ background: "var(--ns-tint-1)", borderColor: "var(--ns-tint-2)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="t-display text-3xl" style={{ color: "var(--ns-coral-deep)" }}>
                        {Math.round(active.score)}%
                      </p>
                      <p className="t-small mt-0.5">match before tailoring</p>
                    </div>
                    {isLive && (
                      <div className="flex flex-wrap gap-2.5">
                        {/* Disabled until the apply route exists: consent event
                            first, itemised manifest, then the bundle crosses
                            the wall. A control must not pretend. */}
                        <button
                          className="ns-btn ns-btn-primary"
                          disabled
                          title="Not built yet. Applying will be an explicit, itemised consent when it ships — nothing is shared until then."
                        >
                          Tailor my CV to this role →
                        </button>
                        <button
                          className="ns-btn ns-btn-secondary"
                          disabled
                          title="Not built yet. Applying will be an explicit, itemised consent when it ships — nothing is shared until then."
                        >
                          Apply with current CV
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="t-small mt-4 max-w-[70ch]">
                    {isLive ? (
                      <>
                        Applying shares your tailored CV and evidence map with{" "}
                        {active.role.agencyName} — for this role only, never a searchable pool.
                        You&apos;ll get a notice of exactly what was shared, and you can withdraw
                        it.
                      </>
                    ) : (
                      <>This role has closed. Your record of it stays yours.</>
                    )}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button className="ns-btn ns-btn-secondary" onClick={() => void dismiss(active.id)}>
                    Not interested
                  </button>
                  <span className="t-small">
                    Dismissing shares nothing. Pause recommendations any time in{" "}
                    <Link href="/settings" className="underline">
                      settings
                    </Link>
                    .
                  </span>
                </div>

                <p className="t-mono mt-8" style={{ color: "var(--ns-ink-40)" }}>
                  PASSING ON THIS ROLE SHARES NOTHING AND COSTS NOTHING
                </p>
              </article>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
