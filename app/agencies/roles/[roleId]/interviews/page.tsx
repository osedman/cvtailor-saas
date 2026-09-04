"use client"

/**
 * Book an interview — Figma "Tailr — Hiring Manager Concept",
 * 02 · Recruiter additions → Recruiter · Book an interview.
 *
 * Deliberately NOT an eighth workflow step. lib/agency/steps.ts is the single
 * source of truth for the seven, and this is an adjunct the recruiter reaches
 * from a role rather than a stage they pass through — the same shape as
 * /agencies/clients and /agencies/briefs.
 *
 * Two pickers, both live: who is on this role, and the windows the client has
 * actually offered from their own workspace. Booking one takes it off the
 * board for everyone, so the copy says so before the button is pressed.
 *
 * THE AMBER NOTE IS NOT DECORATION, and it was rewritten on 20 Aug rather
 * than deleted. The signed-off concept promised Tailr would generate the
 * meeting link and "join, capture and transcribe". Half of that is now real:
 * capture and transcription shipped 17 Aug (behind the DPIA gate, with the
 * candidate's own consent as the only door). Tailr still does NOT host or
 * record the call — the recruiter records it and uploads afterwards — and
 * per-round enrichment is still unbuilt. So the note now says exactly that.
 * It goes when Tailr genuinely hosts the call, and not before; claiming a
 * capability we do not have is the thing this project forbids.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { RoleRail } from "@/components/agency/role-rail"
import { InterviewCapture } from "@/components/agency/interview-capture"
import { RoleHeader, announceRoleChanged } from "@/components/agency/role-header"
import { type PhaseKey } from "@/lib/agency/phases"
import { SignOut } from "@/components/agency/sign-out"

interface Candidate {
  id: string
  ref: string
  full_name: string
  reviewed?: boolean
  overall?: number | null
}

interface OpenSlot {
  id: string
  contactId: string
  company: string
  contactName: string
  startsAt: string
  endsAt: string
}

interface RoundRow {
  id: string
  candidateId: string
  candidateRef: string
  candidateName: string
  roundNumber: number
  scheduledAt: string | null
  durationMinutes: number
  meetingUrl: string
  status: "scheduled" | "completed" | "cancelled"
  company: string
  captureConsentStatus: string
  clientDecision: { decision: string; note: string; decidedAt: string } | null
  hasDebrief: boolean
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).toUpperCase()
}
function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export default function BookInterviewPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const router = useRouter()

  const [role, setRole] = useState<{ ref: string; title: string; plannedRounds: number | null; startTarget: string } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [candidateId, setCandidateId] = useState("")
  const [slotId, setSlotId] = useState("")
  const [meetingUrl, setMeetingUrl] = useState("")
  const [duration, setDuration] = useState(45)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<PhaseKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The consent link, surfaced once. If the email fails the recruiter still
  // has something to send — the ask has to reach a real person either way.
  const [askResult, setAskResult] = useState<{ roundId: string; url: string; emailed: boolean } | null>(null)

  const load = useCallback(async () => {
    announceRoleChanged()
    try {
      const [roleRes, candRes, roundsRes] = await Promise.all([
        fetch(`/api/agency/roles/${roleId}`),
        fetch(`/api/agency/roles/${roleId}/candidates`),
        fetch(`/api/agency/roles/${roleId}/rounds`),
      ])
      if (roleRes.status === 401) return router.push("/agencies")
      if (roleRes.ok) {
        const body = await roleRes.json()
        setPhase((body?.phase as PhaseKey | null) ?? null)
        if (body?.role)
          setRole({
            ref: body.role.ref,
            title: body.role.title,
            plannedRounds: body.role.planned_rounds ?? null,
            startTarget: (body.role.start_target ?? "").trim(),
          })
      }
      if (candRes.ok) {
        const body = await candRes.json()
        setCandidates(Array.isArray(body?.candidates) ? body.candidates : [])
      }
      if (roundsRes.ok) {
        const body = await roundsRes.json()
        setSlots(Array.isArray(body?.openSlots) ? body.openSlots : [])
        setRounds(Array.isArray(body?.rounds) ? body.rounds : [])
      } else {
        setSlots([])
      }
    } catch {
      setSlots([])
      setError("Could not load this role's interviews.")
    }
  }, [roleId, router])

  useEffect(() => {
    void load()
  }, [load])

  const chosenCandidate = candidates.find((c) => c.id === candidateId) ?? null
  const chosenSlot = (slots ?? []).find((s) => s.id === slotId) ?? null

  /** Derived for display; the server is the authority. Cancelled rounds are
   * deliberately INCLUDED, because the server counts them too — the unique
   * index on (role_id, candidate_id, round_number) is status-agnostic, so a
   * cancelled round 1 means the next one really is round 2. Filtering them out
   * here would promise "Round 1" and then book "Round 2". */
  const nextRound = useMemo(() => {
    if (!candidateId) return 1
    const mine = rounds.filter((r) => r.candidateId === candidateId)
    return mine.reduce((max, r) => Math.max(max, r.roundNumber), 0) + 1
  }, [rounds, candidateId])

  async function book() {
    if (!chosenCandidate || !chosenSlot) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          slotId,
          durationMinutes: duration,
          meetingUrl: meetingUrl.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "Could not book that interview.")
        return
      }
      setCandidateId("")
      setSlotId("")
      setMeetingUrl("")
      await load()
    } catch {
      setError("Could not book that interview.")
    } finally {
      setBusy(false)
    }
  }

  /**
   * Ask the candidate whether this round may be recorded.
   *
   * Their answer is theirs: this mints a link and emails it, and cannot set
   * the answer. Nothing on this screen ever shows what they chose — the
   * candidate is told the interviewer will not be told, and
   * getHiringDashboard has a build-failing test keeping that true.
   */
  async function askConsent(roundId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not send that request.")
        return
      }
      setAskResult({ roundId, url: String(body.url ?? ""), emailed: Boolean(body.emailed) })
    } catch {
      setError("Could not send that request.")
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(roundId: string, status: "completed" | "cancelled") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/rounds`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "That did not go through.")
        return
      }
      await load()
    } catch {
      setError("That did not go through.")
    } finally {
      setBusy(false)
    }
  }

  const client = (slots ?? [])[0]
  const ready = Boolean(candidateId && slotId) && !busy

  return (
    <>
      <aside className="ag-sidebar">
        <button
          className="ag-brand"
          style={{ border: "none", background: "none", cursor: "pointer" }}
          onClick={() => router.push("/agencies")}
        >
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <AgencyNav />
        <RoleRail roleId={roleId} phase={phase} current="interviews" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Their diary</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Windows come from the client&apos;s own workspace. Booking one takes it off their
            board; cancelling gives it back.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <RoleHeader roleId={roleId} hat="recruiter" />

          <p className="ag-step-eyebrow">Interview loop · the selection process</p>
          <h1 className="ag-title">
            Rounds, write-ups, decisions —<br />the loop in one place.
          </h1>
          <p className="ag-sub">
            {slots === null
              ? "Loading the client’s windows…"
              : slots.length > 0
                ? `${client?.company || "Your client"} has offered ${slots.length} window${slots.length === 1 ? "" : "s"}. Pick who meets them — the time comes out of the client’s own diary, so booking one takes it off the board for everyone.`
                : "Your client has not offered any times yet. They add them from their own workspace, and they appear here the moment they do."}
          </p>

          {role && (role.plannedRounds || role.startTarget) && (
            <p className="ag-note" style={{ marginTop: 6, color: "var(--ag-ink-3)" }}>
              From the brief:
              {role.plannedRounds ? ` the client expects ${role.plannedRounds} round${role.plannedRounds === 1 ? "" : "s"}` : ""}
              {role.plannedRounds && role.startTarget ? " ·" : ""}
              {role.startTarget ? ` wants someone in seat: ${role.startTarget}` : ""}
              . Their plan, not a gate — what you book is what counts.
            </p>
          )}

          {error && (
            <p className="ag-banner" role="alert">
              {error}
            </p>
          )}

          {/* ── The loop, candidate by candidate ─────────────────────────────
              Round 1 → round 2 → outcome, readable at a glance. The planned
              count is the client's stated expectation and renders as lanes;
              extra rounds simply add a lane, because the plan is never a gate.
              A decline is shown and the candidate stays — a signal, never a
              removal. */}
          {(() => {
            const inLoop = candidates
              .map((c) => ({ c, theirs: rounds.filter((r) => r.candidateId === c.id && r.status !== "cancelled").sort((a, b) => a.roundNumber - b.roundNumber) }))
              .filter((x) => x.theirs.length > 0)
            if (inLoop.length === 0) return null
            const planned = role?.plannedRounds ?? 2
            return (
              <section style={{ marginTop: 24 }} aria-labelledby="loop">
                <p className="ag-field-label" id="loop">The loop · candidate by candidate</p>
                <div className="ag-stack" style={{ gap: 12 }}>
                  {inLoop.map(({ c, theirs }) => {
                    const lanes = Math.max(planned, theirs.length ? theirs[theirs.length - 1].roundNumber : 0)
                    const byNumber = new Map(theirs.map((r) => [r.roundNumber, r]))
                    const last = theirs[theirs.length - 1]
                    const declined = theirs.find((r) => r.clientDecision?.decision === "decline")
                    const lastDecided = last?.status === "completed" ? last.clientDecision : null
                    // What happens next, in one honest sentence.
                    let nextLine: string
                    let done = false
                    if (declined) {
                      nextLine = `Client declined at round ${declined.roundNumber} — their signal, not a removal. ${c.full_name} stays on the role.`
                      done = true
                    } else if (last?.status === "scheduled") {
                      nextLine = `Round ${last.roundNumber} is booked — nothing owed until it happens.`
                    } else if (last && last.status === "completed" && !last.hasDebrief) {
                      nextLine = `Round ${last.roundNumber} happened — waiting on the client's write-up.`
                    } else if (last && last.status === "completed" && !lastDecided) {
                      nextLine = `Write-up is in for round ${last.roundNumber} — waiting on the client's decision.`
                    } else if (lastDecided && last.roundNumber >= planned) {
                      nextLine = `Cleared all ${last.roundNumber} round${last.roundNumber === 1 ? "" : "s"} — advancing. Close-out is next.`
                      done = true
                    } else if (lastDecided) {
                      nextLine = `Advancing after round ${last.roundNumber} — round ${last.roundNumber + 1} of ${planned} to book.`
                    } else {
                      nextLine = "Nothing outstanding."
                    }
                    return (
                      <div key={c.id} className="ag-card ag-loop-card">
                        <div className="ag-loop-head">
                          <span className="ag-grow" style={{ minWidth: 0 }}>
                            <span className="ag-meta">{c.ref}</span>
                            <span className="ag-pick-name">{c.full_name}</span>
                          </span>
                          <span className="ag-loop-lanes" aria-label={`Rounds for ${c.full_name}`}>
                            {Array.from({ length: lanes }, (_, i) => i + 1).map((n) => {
                              const r = byNumber.get(n)
                              const state = !r
                                ? "todo"
                                : r.status === "scheduled"
                                  ? "booked"
                                  : r.clientDecision
                                    ? r.clientDecision.decision === "decline" ? "declined" : "advanced"
                                    : "waiting"
                              const label = !r
                                ? `R${n}`
                                : r.status === "scheduled"
                                  ? `R${n} · ${fmtDay(r.scheduledAt ?? "")}`
                                  : r.clientDecision
                                    ? `R${n} ${r.clientDecision.decision === "decline" ? "· declined" : "✓"}`
                                    : `R${n} · awaiting`
                              return (
                                <span key={n} className={`ag-loop-lane ${state}`}>{label}</span>
                              )
                            })}
                            <span className={`ag-loop-lane outcome${done ? " on" : ""}`}>outcome</span>
                          </span>
                        </div>
                        {last?.clientDecision?.note ? (
                          <p className="ag-loop-note">
                            Client, after round {last.roundNumber}: “{last.clientDecision.note}”
                          </p>
                        ) : null}
                        <div className="ag-loop-foot">
                          <p className="ag-note ag-grow" style={{ margin: 0 }}>{nextLine}</p>
                          {!declined && lastDecided && last.roundNumber < planned && (slots ?? []).length > 0 && (
                            <button
                              className="ag-btn ag-btn-secondary"
                              onClick={() => {
                                setCandidateId(c.id)
                                document.getElementById("book-area")?.scrollIntoView({ behavior: "smooth", block: "start" })
                              }}
                            >
                              Book round {last.roundNumber + 1}
                            </button>
                          )}
                          {done && !declined && (
                            <button
                              className="ag-btn ag-btn-primary"
                              onClick={() => router.push(`/agencies/roles/${roleId}/close-out`)}
                            >
                              Take to close-out →
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {slots !== null && slots.length > 0 && (
            <>
              <p className="ag-field-label" id="book-area" style={{ marginTop: 28 }}>Book the next round</p>
              <div className="ag-book-grid">
                <section aria-labelledby="who-meets">
                  <p className="ag-field-label" id="who-meets">Who meets them</p>
                  <div className="ag-stack" style={{ gap: 10 }}>
                    {candidates.length === 0 ? (
                      <p className="ag-note">
                        No candidates on this role yet. Add them in step 03 — anyone on the role can
                        be met, screened or not.
                      </p>
                    ) : (
                      candidates.map((c) => {
                        const theirs = rounds.filter(
                          (r) => r.candidateId === c.id && r.status !== "cancelled"
                        )
                        const done = theirs.filter((r) => r.status === "completed").length
                        return (
                          <button
                            key={c.id}
                            className={`ag-card ag-pick${candidateId === c.id ? " on" : ""}`}
                            onClick={() => setCandidateId(c.id)}
                            aria-pressed={candidateId === c.id}
                          >
                            <span className="ag-grow" style={{ minWidth: 0 }}>
                              <span className="ag-meta">{c.ref}</span>
                              <span className="ag-pick-name">{c.full_name}</span>
                            </span>
                            <span className="ag-meta">
                              {theirs.length === 0
                                ? "Not met"
                                : `R${theirs.length}${done ? " done" : " booked"}`}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <p className="ag-note" style={{ marginTop: 10 }}>
                    Anyone on the role can be met, screened or not — Tailr does not gate who you put
                    forward.
                  </p>
                </section>

                <section aria-labelledby="their-windows">
                  <p className="ag-field-label" id="their-windows">Their open windows</p>
                  <div className="ag-stack" style={{ gap: 10 }}>
                    {slots.map((s) => (
                      <button
                        key={s.id}
                        className={`ag-card ag-pick${slotId === s.id ? " on" : ""}`}
                        onClick={() => setSlotId(s.id)}
                        aria-pressed={slotId === s.id}
                      >
                        <span className="ag-grow" style={{ minWidth: 0 }}>
                          <span className="ag-meta">{fmtDay(s.startsAt)}</span>
                          <span className="ag-pick-name">
                            {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                          </span>
                        </span>
                        {slotId === s.id && <span className="ag-meta">Selected</span>}
                      </button>
                    ))}
                  </div>
                  <p className="ag-note" style={{ marginTop: 10 }}>
                    Offered by {client?.contactName || "your client"} from their workspace. Booking
                    one removes it from the board — the client never has a time taken without
                    offering it first.
                  </p>
                </section>
              </div>

              <div className="ag-card" style={{ padding: "20px 24px", marginTop: 20 }}>
                <p className="ag-field-label">Joining link</p>
                <div className="ag-book-link">
                  <input
                    className="ag-input"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value.slice(0, 500))}
                    placeholder="Paste your Teams / Meet / Zoom link"
                    aria-label="Joining link"
                  />
                  <select
                    className="ag-input ag-book-dur"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    aria-label="Duration in minutes"
                  >
                    {[30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>
                {/* See the file header: this note is load-bearing, not filler. */}
                <p className="ag-callout ag-book-warn">
                  Tailr does not host or record this call. Use your own meeting link and, if the
                  candidate agrees to it, upload the recording afterwards — the ask, the upload and
                  the transcript live on the round below. Per-round enrichment is not built yet.
                </p>
              </div>

              <div className="ag-card ag-book-confirm">
                <div className="ag-grow" style={{ minWidth: 0 }}>
                  <p className="ag-book-summary">
                    {chosenCandidate && chosenSlot
                      ? `Round ${nextRound} · ${chosenCandidate.full_name} · ${fmtDay(chosenSlot.startsAt)}, ${fmtTime(chosenSlot.startsAt)}`
                      : "Choose a person and a window"}
                  </p>
                  <p className="ag-note">
                    {chosenCandidate
                      ? "The round number follows what they have already had — you cannot skip or repeat one."
                      : "Both sides are needed before anything is booked."}
                  </p>
                </div>
                <span className="ag-pill">Audit logged</span>
                <button className="ag-btn ag-btn-primary" onClick={book} disabled={!ready}>
                  {busy ? "Booking…" : "Book this interview"}
                </button>
              </div>
            </>
          )}

          {rounds.length > 0 && (
            <section style={{ marginTop: 28 }} aria-labelledby="booked">
              <p className="ag-field-label" id="booked">Booked</p>
              <div className="ag-stack" style={{ gap: 10 }}>
                {rounds.map((r) => (
                  <div key={r.id} className="ag-card">
                  <div className="ag-booked">
                    <span className="ag-grow" style={{ minWidth: 0 }}>
                      <span className="ag-meta">
                        {r.candidateRef} · round {r.roundNumber}
                        {r.status !== "scheduled" ? ` · ${r.status}` : ""}
                      </span>
                      {/* The name opens the candidate file — the paperwork
                          (RTW, references, placement) that interviews feed. */}
                      <button
                        className="ag-crumb-link ag-pick-name"
                        style={{ display: "block", textAlign: "left", font: "inherit", padding: 0 }}
                        title="Open the candidate file — right to work, references, placement"
                        onClick={() => router.push(`/agencies/candidates/${r.candidateId}`)}
                      >
                        {r.candidateName}
                      </button>
                      <span className="ag-meta">
                        {r.scheduledAt ? `${fmtDay(r.scheduledAt)}, ${fmtTime(r.scheduledAt)}` : "No time"}
                        {` · ${r.durationMinutes} min`}
                        {r.meetingUrl ? " · link added" : " · no link"}
                      </span>
                    </span>
                    {r.status === "scheduled" && (
                      <>
                        {/* Marking it done is the act that moves the round on,
                            so it leads. The consent ask is a different kind of
                            thing — it reaches a person — and cancelling is the
                            quietest, because it gives the client's time back. */}
                        <button
                          className="ag-btn ag-btn-primary"
                          onClick={() => setStatus(r.id, "completed")}
                          disabled={busy}
                        >
                          Mark done
                        </button>
                        <button
                          className="ag-btn"
                          onClick={() => setStatus(r.id, "cancelled")}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {askResult?.roundId === r.id && (
                      <p className="ag-note ag-ask-result">
                        {askResult.emailed
                          ? "Asked. The candidate has the link; you will not be told what they choose."
                          : "We could not email them, so send this link yourself — it is shown once:"}
                        {!askResult.emailed && <code className="ag-ask-url">{askResult.url}</code>}
                      </p>
                    )}
                  </div>
                  {/* Recording folded away: it is an attachment to the round,
                      not a gate on reviewing it. Rendered as a wall of BLOCKED
                      panels it read as the flow being broken, when the truth is
                      just "nobody has agreed to a recording" — which is fine.
                      Everything consent-shaped is unchanged inside: the ask
                      still goes only to the candidate, and their answer still
                      never shows here. Cancelled rounds have nothing to record. */}
                  {r.status !== "cancelled" && (
                    <details className="ag-rec-details">
                      <summary className="ag-rec-summary">
                        Recording &amp; capture
                        <span className="ag-meta" style={{ marginLeft: 8 }}>
                          {r.captureConsentStatus === "pending" ? "not asked yet" : "asked — their answer is theirs"}
                        </span>
                      </summary>
                      {r.status === "scheduled" && (
                        <div style={{ margin: "10px 0 4px" }}>
                          <button
                            className="ag-btn ag-btn-secondary"
                            onClick={() => askConsent(r.id)}
                            disabled={busy || r.captureConsentStatus !== "pending"}
                            title={
                              r.captureConsentStatus === "pending"
                                ? "Emails the candidate a link asking whether this call may be recorded. Their answer is theirs; you are not told what they chose."
                                : "Already asked. Their answer is theirs, and this screen never shows it."
                            }
                          >
                            {r.captureConsentStatus === "pending" ? "Ask about recording" : "Recording asked"}
                          </button>
                        </div>
                      )}
                      <InterviewCapture roundId={r.id} candidateName={r.candidateName} />
                    </details>
                  )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* The loop is at rest: rounds have happened and none is still in the
              diary. Deliberately NOT "the client has decided" — that is their
              word to say, and a decision is a signal rather than a state change.
              This only observes that nothing is outstanding, and offers the
              door. Booking another round stays available above. */}
          {(() => {
            const live = rounds.filter((r) => r.status !== "cancelled")
            const waiting = rounds.filter((r) => r.status === "scheduled")
            if (live.length === 0 || waiting.length > 0) return null
            return (
              <div className="ag-handoff" role="status" style={{ marginTop: 24 }}>
                <div className="ag-handoff-body">
                  <p className="ag-handoff-title">
                    Nothing outstanding in the loop — {live.length} round{live.length === 1 ? " has" : "s have"} happened and none is booked.
                  </p>
                  <p className="ag-handoff-sub">
                    If the client has chosen someone, close-out collects references and builds the
                    handover pack. If they have not, book another round above — the expected count
                    is their plan, never a limit, and nothing here removes anyone.
                  </p>
                </div>
                <button
                  className="ag-btn ag-btn-primary"
                  onClick={() => router.push(`/agencies/roles/${roleId}/close-out`)}
                >
                  Go to close-out →
                </button>
              </div>
            )
          })()}

          <p className="ag-note-quiet" style={{ marginTop: 28 }}>
            Booking takes the time off the client’s board · cancelling gives it back.
          </p>
        </div>
      </main>
    </>
  )
}
