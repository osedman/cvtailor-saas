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
 * Applying is real: a manifest sheet (GET /api/found/[id]/apply) shows
 * exactly what would be shared, the confirm POSTs with an EMPTY body — the
 * server recomputes the payload, so the sheet and the share cannot differ —
 * and the button says "Send this to {agency}", not "Apply", per the frame
 * decision. Tailor-first (Figma "Tailor-first apply — changed surfaces",
 * signed off 16 Aug): "Tailor my CV to this role" opens /tailor?rec=… in
 * role mode, and once a tailored CV exists for THIS version of the role the
 * band flips — applying sends that CV, exactly as last saved, instead of the
 * evidence-bank render.
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
import { useDialog } from "@/lib/use-dialog"
import { formatDayShort } from "@/lib/format-date"
import type { FoundRole } from "@/lib/matching/found"
import { errorMessage } from "@/lib/error-message"

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
  // The apply flow: manifest fetched → sheet shown → confirmed → done panel.
  // The POST body is empty; the server recomputes everything, so the sheet
  // and the share cannot be two different things.
  const [manifest, setManifest] = useState<{
    sharedWith: string
    roleTitle: string
    retentionDays: number
    name: string
    email: string | null
    evidenceCardCount: number
    cvSource: "tailored" | "evidence_bank"
    tailoredSavedAt: string | null
    evidenceMap: Array<{ ref: string; text: string; strength: string; quote: string | null }>
    score: number
  } | null>(null)
  const [manifestFor, setManifestFor] = useState<string | null>(null)
  const [applyBusy, setApplyBusy] = useState(false)
  const [appliedResult, setAppliedResult] = useState<{
    candidateRef: string
    rightsPath: string
  } | null>(null)
  const [copied, setCopied] = useState<boolean | null>(null)

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
      setError(errorMessage(err))
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
        toast.error(errorMessage(err))
      }
    },
    [load]
  )

  const openManifest = useCallback(async (id: string) => {
    setApplyBusy(true)
    try {
      const res = await fetch(`/api/found/${id}/apply`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Could not prepare the application.")
      setManifest(data.manifest)
      setManifestFor(id)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setApplyBusy(false)
    }
  }, [])

  const confirmApply = useCallback(async () => {
    if (!manifestFor) return
    setApplyBusy(true)
    try {
      const res = await fetch(`/api/found/${manifestFor}/apply`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "That did not send.")
      setAppliedResult({ candidateRef: data.candidateRef, rightsPath: data.rightsPath })
      setManifest(null)
      setManifestFor(null)
      void load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setApplyBusy(false)
    }
  }, [manifestFor, load])

  // Closing the sheet shares nothing, so click-outside and Escape are safe
  // dismissals here — the copy already says so ("Closing this shares nothing").
  const closeSheet = useCallback(() => {
    setManifest(null)
    setManifestFor(null)
  }, [])
  const sheet = useDialog(!!manifest, closeSheet)
  const closeSent = useCallback(() => {
    setAppliedResult(null)
    setCopied(null)
  }, [])
  const sent = useDialog(!!appliedResult, closeSent)

  const copyRightsLink = useCallback(async (rightsPath: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${rightsPath}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [])

  const active = found?.find((f) => f.id === selected) ?? null
  const open = (found ?? []).filter((f) => f.state !== "dismissed")
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

  /** Rendered from the signed-in return below. These once sat inside the
   * signed-out early return, where `manifest` can never be set — so a
   * successful manifest GET opened nothing at all. */
  const overlays = (
    <>
        {/* ── the consent sheet: Art 13 at the moment of applying ───────
            Everything named here is exactly what the server will share; the
            confirm sends no body, so the two cannot diverge. The button names
            the agency — "Send this to X", never a generic "Apply". */}
        {manifest && (
          <div className="ns-scrim" onClick={sheet.onScrimClick}>
            <div
              ref={sheet.panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="apply-sheet-title"
              className="w-full max-w-lg rounded-2xl border p-6 max-h-[85vh] overflow-y-auto [overscroll-behavior:contain]"
              style={{ background: "var(--ns-paper)", borderColor: "var(--ns-border)" }}
            >
              <p className="t-eyebrow">Before anything is shared</p>
              <h2 id="apply-sheet-title" className="t-title mt-1.5 text-xl text-pretty">
                Send your application to {manifest.sharedWith}?
              </h2>
              <p className="t-body mt-2" style={{ color: "var(--ns-ink-70)" }}>
                For {manifest.roleTitle} — this role only, never a searchable pool. They receive:
              </p>
              <ul className="mt-3 space-y-1.5">
                <li className="t-small break-words">
                  · Your name{manifest.email ? " and email" : ""} — {manifest.name}
                  {manifest.email ? ` · ${manifest.email}` : ""}
                </li>
                {/* What the CV text actually is — the changed line (Figma
                    "Tailor-first apply", section C). The tailored CV replaces
                    the bank render, never both. */}
                {manifest.cvSource === "tailored" ? (
                  <li className="t-small">
                    · Your tailored CV for this role — exactly as you last saved it
                    {manifest.tailoredSavedAt
                      ? ` (${formatDayShort(manifest.tailoredSavedAt)}, edits included)`
                      : " (edits included)"}
                  </li>
                ) : (
                  <li className="t-small">
                    · Your evidence bank as a profile ({manifest.evidenceCardCount} claims, your own
                    wording)
                  </li>
                )}
                <li className="t-small">
                  · The evidence map for this role (
                  {manifest.evidenceMap.filter((e) => e.strength !== "missing").length} backed,{" "}
                  {manifest.evidenceMap.filter((e) => e.strength === "missing").length} shown as
                  missing)
                </li>
                <li className="t-small">· Your match score ({Math.round(manifest.score)}%)</li>
              </ul>
              <p className="t-small mt-3" style={{ color: "var(--ns-ink-55)" }}>
                They keep it for {manifest.retentionDays} days after the role closes, and you can
                exercise your rights over it at any time — the link comes with your confirmation.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  className="ns-btn ns-btn-primary"
                  onClick={() => void confirmApply()}
                  disabled={applyBusy}
                  aria-busy={applyBusy}
                >
                  {applyBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {applyBusy ? "Sending…" : `Send this to ${manifest.sharedWith}`}
                </button>
                <button className="ns-btn ns-btn-secondary" onClick={closeSheet} disabled={applyBusy}>
                  Not now
                </button>
              </div>
              <p className="t-small mt-3" style={{ color: "var(--ns-ink-40)" }}>
                Closing this shares nothing.
              </p>
            </div>
          </div>
        )}

        {/* ── the notice of exactly what was shared ───────────────────── */}
        {appliedResult && (
          /* No scrim-click dismissal here on purpose: the rights link is shown
             once, and a stray click outside must not be how it disappears. */
          <div className="ns-scrim">
            <div
              ref={sent.panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="apply-sent-title"
              className="w-full max-w-lg rounded-2xl border p-6 max-h-[85vh] overflow-y-auto [overscroll-behavior:contain]"
              style={{ background: "var(--ns-paper)", borderColor: "var(--ns-border)" }}
            >
              <p className="t-eyebrow">Sent</p>
              <h2 id="apply-sent-title" className="t-title mt-1.5 text-xl text-pretty">
                You are in their pipeline as {appliedResult.candidateRef}.
              </h2>
              <p className="t-body mt-2" style={{ color: "var(--ns-ink-70)" }}>
                Exactly what you confirmed was shared — nothing else. This is your rights link for
                that record: access, correction, or erasure, no account needed. Save it; it is
                shown once.
              </p>
              <p className="t-mono mt-3 break-all rounded-lg border px-3 py-2" style={{ background: "#fdfcf9", borderColor: "var(--ns-border)" }}>
                {typeof window !== "undefined" ? window.location.origin : ""}{appliedResult.rightsPath}
              </p>
              <div className="mt-5 flex gap-2.5">
                <button
                  className="ns-btn ns-btn-secondary"
                  onClick={() => void copyRightsLink(appliedResult.rightsPath)}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button className="ns-btn ns-btn-primary" onClick={closeSent}>
                  Done
                </button>
              </div>
              {/* The copy either worked or it did not, and this link is shown
                  once — clipboard access is blocked often enough (insecure
                  context, permissions) that a silent no-op is unacceptable. */}
              <p className="t-small mt-2" aria-live="polite" style={{ color: "var(--ns-ink-55)" }}>
                {copied === true && "Copied to your clipboard."}
                {copied === false && "Could not copy automatically — select the link above and copy it."}
              </p>
            </div>
          </div>
        )}
    </>
  )

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
                  {/* Not a heading: this sits inside the card's button, where
                      an <h2> would fold into the button's accessible name and
                      put a rung in the outline that leads nowhere. The role
                      title IS the <h2> on the detail pane at the right. */}
                  <p className="t-title mt-1.5 text-lg break-words">{rec.role.title}</p>
                  <p className="t-small mt-1 break-words">
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
                  {/* Two band states (Figma "Tailor-first apply", sections
                      A/B): before a tailored CV exists, tailoring is the
                      primary act; once one exists for THIS version of the
                      role, applying with it is. */}
                  {/* Uppercased in CSS, not JS: a screen reader reading the
                      DOM text gets ordinary words rather than something it
                      may spell out letter by letter. */}
                  {active.tailored && isLive && active.state !== "applied" && (
                    <span
                      className="ns-chip mb-3 inline-flex uppercase"
                      style={{ background: "#fff", borderColor: "var(--ns-tint-2)", color: "var(--ns-coral-deep)" }}
                    >
                      Tailored CV ready · saved {formatDayShort(active.tailored.savedAt)}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="t-display text-3xl" style={{ color: "var(--ns-coral-deep)" }}>
                        {Math.round(active.score)}%
                      </p>
                      <p className="t-small mt-0.5">match before tailoring</p>
                    </div>
                    {isLive && active.state !== "applied" && (
                      <div className="flex flex-wrap gap-2.5">
                        {active.tailored ? (
                          <>
                            <button
                              className="ns-btn ns-btn-primary"
                              onClick={() => void openManifest(active.id)}
                              disabled={applyBusy}
                            >
                              {applyBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                              Apply — send your tailored CV
                            </button>
                            <Link className="ns-btn ns-btn-secondary" href={`/tailor?rec=${active.id}`}>
                              Re-open in Tailor
                            </Link>
                          </>
                        ) : (
                          <>
                            <Link className="ns-btn ns-btn-primary" href={`/tailor?rec=${active.id}`}>
                              Tailor my CV to this role →
                            </Link>
                            <button
                              className="ns-btn ns-btn-secondary"
                              onClick={() => void openManifest(active.id)}
                              disabled={applyBusy}
                            >
                              {applyBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                              Apply with my evidence
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {active.state === "applied" && (
                      <span className="ns-chip ns-chip-missing">APPLIED</span>
                    )}
                    {active.state === "invited" && (
                      <span className="ns-chip ns-chip-have">A recruiter at {active.role.agencyName} invited you to apply</span>
                    )}
                  </div>
                  <p className="t-small mt-4 max-w-[70ch]">
                    {!isLive ? (
                      <>This role has closed. Your record of it stays yours.</>
                    ) : active.tailored ? (
                      <>
                        Applying sends the version you last saved — edits included — plus your
                        evidence map, to {active.role.agencyName}. For this role only, never a
                        searchable pool.
                      </>
                    ) : (
                      <>
                        Tailoring happens in your Tailr, against this role&apos;s requirements
                        exactly as they found you. Nothing is shared by tailoring — applying is
                        still the only door, and you&apos;ll see exactly what would be sent first.
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {active.state !== "applied" && (
                  <button className="ns-btn ns-btn-secondary" onClick={() => void dismiss(active.id)}>
                    Not interested
                  </button>
                  )}
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
        {overlays}
      </main>
    </div>
  )
}
