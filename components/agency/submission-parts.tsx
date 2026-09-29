"use client"

/**
 * Step 07 — send to the client (Figma board 34, approved 29 Sep 2026).
 *
 * The shortlist goes to named people in their Tailr workspace; a PDF, an
 * email summary and a personal link are extras. These are the parts of that
 * screen that are not page state:
 *
 *   SubmissionPreview   the hiring manager's shortlist, as their workspace
 *                       draws it — the same cards, the same words, the same
 *                       disclosure line — not a mock of a portal.
 *   SubmissionDocument  the printable document (confidentiality footer and
 *                       "Known gaps, stated plainly" included), rendered only
 *                       for print.
 *   PrintPortal         mounts the document at the body so printing it hides
 *                       the app instead of printing around it.
 *   SubmissionProgress  the receipt after sending: where the client is up
 *                       to, read from the rows that prove each step.
 */

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"

export type SubmissionRow = {
  key: string; ref: string; name: string; title: string; years: number | null; location: string
  overall: number; confidence: number; reviewed: boolean; narrative: string
  musts: Array<{ text: string; strength: string; quote: string | null }>
  gaps: string[]; probes: string[]; comp: string; availability: string
  /** Must-haves cleared, from the score row (live) or the snapshot (sent). */
  mustHit: number | null; mustTotal: number | null
  /** Name withheld at the candidate's request: the client sees the ref. */
  redacted: boolean
}

export interface SubmissionDisclosure { scores: boolean; evidence: boolean; probes: boolean; notes: boolean; logistics: boolean; cv: boolean }

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
const tier = (n: number) => (n >= 80 ? "hi" : n >= 60 ? "med" : "lo")

// ── The hiring manager's view ─────────────────────────────────────────────

/**
 * Mirrors app/hiring/roles/[roleId]/shortlist/page.tsx: name (or the ref
 * when withheld), "Not decided yet", the sub line, the recruiter's note or
 * the sentence that says notes were not shared, one strength, the known gaps,
 * and the evidence toggle — then the hand-off to choosing and offering times.
 * The disclosure switches are applied here exactly as discloseEntry applies
 * them there, so flipping one changes the preview the way it will change
 * their screen.
 */
export function SubmissionPreview({
  rows,
  disclosure,
  intro,
  roleTitle,
  agencyName,
}: {
  rows: SubmissionRow[]
  disclosure: SubmissionDisclosure
  intro: string
  roleTitle: string
  agencyName: string
}) {
  const on = [disclosure.scores && "Scores", disclosure.evidence && "evidence", disclosure.cv && "CV"].filter(Boolean) as string[]
  return (
    <section className="ag-hmp" aria-labelledby="ag-hmp-h">
      <div className="ag-hmp-head">
        <div style={{ minWidth: 0 }}>
          <p className="ag-hmp-eyebrow">Live preview · what their workspace shows</p>
          <h2 className="ag-hmp-title" id="ag-hmp-h">
            {roleTitle} · {rows.length === 1 ? "1 candidate" : `${rows.length} candidates`} sent by {agencyName}
          </h2>
        </div>
        <span className="ag-hmp-chip">{on.length > 0 ? `${on.join(" · ")} on` : "Names and notes only"}</span>
      </div>
      {intro.trim() && (
        <blockquote className="ag-hmp-intro">
          <span>From your recruiter</span>
          {intro}
        </blockquote>
      )}
      <ul className="ag-hmp-list">
        {rows.map((r) => {
          const first = disclosure.evidence ? r.musts.find((m) => m.strength === "strong" && m.quote) : undefined
          return (
            <li key={r.key} className="ag-hmp-card">
              <div className="ag-hmp-card-head">
                <span className="ag-hmp-name">{r.redacted || !r.name ? r.ref : r.name}</span>
                <span className="ag-hmp-state">Not decided yet</span>
              </div>
              <p className="ag-hmp-sub">
                {[r.ref, r.title, r.location, r.years ? `${r.years} yrs` : null].filter(Boolean).join(" · ")}
                {disclosure.scores && r.mustHit !== null && r.mustTotal !== null ? ` · clears ${r.mustHit} of ${r.mustTotal} must-haves` : ""}
              </p>
              {disclosure.notes && r.narrative ? (
                <p className="ag-hmp-note">{r.narrative}</p>
              ) : !disclosure.notes ? (
                <p className="ag-hmp-quiet">The recruiter&apos;s screening notes are not part of this submission.</p>
              ) : null}
              {first && (
                <p className="ag-hmp-evidence">
                  <b>{first.text}:</b> “{first.quote}”
                </p>
              )}
              {disclosure.evidence && r.gaps.length > 0 && (
                <p className="ag-hmp-quiet">Known gaps: {r.gaps.slice(0, 3).join(" · ")}</p>
              )}
              <span className="ag-hmp-more">{disclosure.cv && !r.redacted ? "See the evidence and CV" : "See the evidence"}</span>
            </li>
          )
        })}
      </ul>
      <div className="ag-hmp-handoff">
        <span>Choose who you want to interview, then offer the times you can do — the candidates you choose book themselves in.</span>
        <span className="ag-hmp-cta">Choose and offer times →</span>
      </div>
    </section>
  )
}

// ── The document ──────────────────────────────────────────────────────────

/** The printable shortlist. Unchanged in content from the old Document tab. */
export function SubmissionDocument({
  rows,
  disclosure,
  intro,
  roleTitle,
  company,
  stats,
}: {
  rows: SubmissionRow[]
  disclosure: SubmissionDisclosure
  intro: string
  roleTitle: string
  company: string
  stats: { reviewed: number; shortlisted: number; musts: number; held: number }
}) {
  return (
    <div className="ag-card-body ag-stack" style={{ gap: 16 }}>
      <div className="ag-cfp-head">
        <div className="ag-portal-eyebrow">Shortlist · {roleTitle}</div>
        <div className="ag-cfp-company">{company || "Your client"}</div>
        <p className="ag-cfp-intro-frozen">{intro || "No introduction was written."}</p>
        <div className="ag-cfp-stats">
          <span><span className="ag-cfp-stat-k">Reviewed</span><span className="ag-cfp-stat-v">{stats.reviewed}</span></span>
          <span><span className="ag-cfp-stat-k">Shortlisted</span><span className="ag-cfp-stat-v">{stats.shortlisted}</span></span>
          <span><span className="ag-cfp-stat-k">Must-haves</span><span className="ag-cfp-stat-v">{stats.musts}</span></span>
          <span><span className="ag-cfp-stat-k">Held</span><span className="ag-cfp-stat-v">{stats.held}</span></span>
        </div>
      </div>
      {rows.map((r, i) => (
        <article className="ag-cfp-cand" key={r.key}>
          <div className="ag-cfp-cand-head">
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              <div className="ag-avatar" style={{ width: 38, height: 38 }}>{initials(r.redacted ? r.ref : r.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="ag-meta">{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.redacted ? r.ref : r.name}</span>
                  {r.reviewed && <span className="ag-reviewed inline">Call done</span>}
                </div>
                <span className="ag-meta">{[r.title, r.years ? `${r.years} yrs` : ""].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
            {disclosure.scores && (
              <span className={`ag-score ${tier(r.overall)}`} style={{ fontSize: 15 }}>{Math.round(r.overall)}</span>
            )}
          </div>
          <div className="ag-cfp-body">
            {disclosure.notes && r.narrative && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}>{r.narrative}</p>}
            {disclosure.evidence && r.musts.length > 0 && (
              <div>
                <div className="ag-field-label">Must-have evidence</div>
                <div className="ag-stack" style={{ gap: 6 }}>
                  {r.musts.map((m, j) => (
                    <div key={j} className="ag-cfp-ev">
                      <span className={`ag-dot ${m.strength}`} style={{ marginTop: 4 }} />
                      <span style={{ fontWeight: 500, flex: "none", maxWidth: "40%" }}>{m.text}</span>
                      {m.quote && <span className="ag-cfp-quote">— &ldquo;{m.quote}&rdquo;</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {disclosure.evidence && r.gaps.length > 0 && (
              <div>
                <div className="ag-field-label" style={{ color: "var(--ag-warn)" }}>Known gaps, stated plainly</div>
                <ul className="ag-cfp-probes">
                  {r.gaps.slice(0, 4).map((g, j) => <li key={j}>{g}</li>)}
                </ul>
              </div>
            )}
            {disclosure.probes && r.probes.length > 0 && (
              <div>
                <div className="ag-field-label">What to probe at interview</div>
                <ul className="ag-cfp-probes">
                  {r.probes.slice(0, 3).map((p, j) => <li key={j}>{p}</li>)}
                </ul>
              </div>
            )}
            {disclosure.logistics && (r.comp || r.location || r.availability) && (
              <div className="ag-cfp-logistics">
                {r.comp && <span><span className="ag-field-label" style={{ marginBottom: 2 }}>Comp</span>{r.comp}</span>}
                {r.location && <span><span className="ag-field-label" style={{ marginBottom: 2 }}>Location</span>{r.location}</span>}
                <span><span className="ag-field-label" style={{ marginBottom: 2 }}>Availability</span>{r.availability || "To confirm"}</span>
              </div>
            )}
          </div>
        </article>
      ))}
      <p className="ag-doc-legal">
        This shortlist was prepared with AI-assisted evidence matching, and every score traces back to source CV content or to a recruiter override recorded against a named person. No candidate was rejected automatically. Final hiring decisions remain with {company || "the client"}. This document is confidential.
      </p>
    </div>
  )
}

/** Mounts children at <body> so the print stylesheet can hide the app. */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.createElement("div")
    el.className = "ag-print-portal"
    document.body.appendChild(el)
    setHost(el)
    return () => {
      el.remove()
    }
  }, [])
  return host ? createPortal(children, host) : null
}

/** Print the document only; the class is how the stylesheet knows. */
export function printShortlistDocument() {
  if (typeof window === "undefined") return
  document.body.classList.add("ag-printing-shortlist")
  const done = () => {
    document.body.classList.remove("ag-printing-shortlist")
    window.removeEventListener("afterprint", done)
  }
  window.addEventListener("afterprint", done)
  window.print()
}

// ── The receipt ───────────────────────────────────────────────────────────

interface Progress {
  sentAt: string
  sends: number
  shortlisted: number
  recipients: number
  openedAt: string | null
  opened: number
  decided: number
  chosen: number
  slotsOffered: number
  firstSlotAt: string | null
  rounds: number
  firstRoundAt: string | null
}

export interface DeliveryRow { contact_id: string; name: string; workspace: boolean; invited: boolean; emailed: boolean }

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""

/**
 * Where the client is up to, from /submission/progress. A failed load says
 * so; it never renders as "nothing has happened".
 */
export function SubmissionProgress({
  roleId,
  company,
  delivery,
  links,
  showLinks,
  onGoInterviews,
  onPdf,
  onCopyEmail,
  whoHasIt,
}: {
  roleId: string
  company: string
  delivery: DeliveryRow[] | null
  links: Array<{ url: string; contact_id?: string }>
  showLinks: boolean
  onGoInterviews: () => void
  onPdf: () => void
  onCopyEmail: () => void
  whoHasIt: React.ReactNode
}) {
  const [p, setP] = useState<Progress | null>(null)
  const [failed, setFailed] = useState(false)
  const [linksOpen, setLinksOpen] = useState(showLinks)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/submission/progress`, { cache: "no-store" })
      if (!res.ok) return setFailed(true)
      const body = (await res.json()) as { progress: Progress | null }
      setFailed(false)
      setP(body.progress)
    } catch {
      setFailed(true)
    }
  }, [roleId])
  useEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [load])

  const steps = p
    ? [
        { label: "Delivered", sub: `To ${p.recipients === 1 ? "1 person" : `${p.recipients} people`} · ${when(p.sentAt)}`, done: p.recipients > 0 },
        { label: "Opened", sub: p.openedAt ? when(p.openedAt) : "Not yet", done: Boolean(p.openedAt) },
        {
          label: "People chosen",
          sub:
            p.decided === 0
              ? "Not yet"
              : `${p.chosen} to meet${p.shortlisted - p.decided > 0 ? ` · waiting on ${p.shortlisted - p.decided}` : ""}`,
          done: p.decided > 0 && p.decided >= p.shortlisted,
          started: p.decided > 0,
        },
        { label: "Times offered", sub: p.slotsOffered > 0 ? `${p.slotsOffered} window${p.slotsOffered === 1 ? "" : "s"}` : "Not yet", done: p.slotsOffered > 0 },
        { label: "First interview", sub: p.firstRoundAt ? when(p.firstRoundAt) : p.rounds > 0 ? "Booked" : "You book it", done: p.rounds > 0 },
      ]
    : []
  const nowIndex = steps.findIndex((s) => !s.done)

  async function copy(url: string) {
    try {
      await navigator.clipboard?.writeText(url)
      setCopied(url)
    } catch {
      setCopied(null)
    }
  }

  return (
    <section className="ag-receipt" aria-labelledby="ag-receipt-h">
      <div className="ag-receipt-top">
        <div style={{ minWidth: 0 }}>
          <p className="ag-receipt-eyebrow">{p ? `Sent ${when(p.sentAt)} · frozen` : "Sent · frozen"}</p>
          <h2 className="ag-receipt-title" id="ag-receipt-h">
            {company || "The client"} has the shortlist in their workspace.
          </h2>
        </div>
        <button className="ag-btn ag-btn-primary" onClick={onGoInterviews}>
          Go to interviews →
        </button>
      </div>

      {failed && <p className="ag-note" role="status">Could not check where the client is up to. It will try again when you come back to this tab.</p>}
      {p && (
        <ol className="ag-receipt-steps">
          {steps.map((s, i) => {
            const state = s.done ? "done" : i === nowIndex ? "now" : "todo"
            return (
              <li key={s.label} className="ag-receipt-step" data-state={state}>
                <span className="ag-receipt-step-label">
                  <span aria-hidden="true">{state === "done" ? "✓" : state === "now" ? "●" : "○"}</span> {s.label}
                </span>
                <span className="ag-receipt-step-sub">{s.sub}</span>
              </li>
            )
          })}
        </ol>
      )}

      {delivery && delivery.length > 0 && (
        <ul className="ag-receipt-delivery">
          {delivery.map((d) => (
            <li key={d.contact_id}>
              <b>{d.name}</b>
              {" · "}
              {d.workspace ? "in their workspace" : d.invited ? "invited to a workspace" : "not reachable yet"}
              {d.emailed ? " · emailed" : d.invited ? " · the email did not go, share the link below" : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="ag-receipt-extras">
        <button className="ag-linkbtn" onClick={onPdf}>Save as PDF</button>
        <button className="ag-linkbtn" onClick={onCopyEmail}>Copy the email text</button>
        {links.length > 0 && (
          <button className="ag-linkbtn" aria-expanded={linksOpen} onClick={() => setLinksOpen((v) => !v)}>
            {linksOpen ? "Hide personal links" : "Send someone a link"}
          </button>
        )}
        <button className="ag-linkbtn" aria-expanded={revokeOpen} onClick={() => setRevokeOpen((v) => !v)}>
          Who has it · revoke
        </button>
      </div>
      {linksOpen && links.length > 0 && (
        <div className="ag-stack" style={{ gap: 8 }}>
          <p className="ag-prose-note" style={{ margin: 0 }}>
            Personal links, one per person, shown once — they are not stored. Each expires in 30 days and can be revoked on its own.
          </p>
          {links.map((l) => (
            <div className="ag-link-row" key={l.url}>
              <span className="ag-link-url">{l.url}</span>
              <button className="ag-btn ag-btn-secondary" onClick={() => void copy(l.url)}>
                {copied === l.url ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}
      {revokeOpen && whoHasIt}
    </section>
  )
}
