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
 * THE AMBER NOTE IS NOT DECORATION. The signed-off concept promised that Tailr
 * generates the meeting link and "joins, captures and transcribes". None of
 * that is built, and it cannot be until the candidate-facing consent copy
 * clears the DPIA gate (AGENCIES_SCHEMA.md §5.5). Rendering a Tailr-generated
 * link here would be exactly the faked capability the project forbids, so the
 * recruiter pastes their own and the screen states what does not exist yet.
 * Delete that note the day capture ships, and not before.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { AgencySwitcher } from "@/components/agency/agency-switcher"

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

  const [role, setRole] = useState<{ ref: string; title: string } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [candidateId, setCandidateId] = useState("")
  const [slotId, setSlotId] = useState("")
  const [meetingUrl, setMeetingUrl] = useState("")
  const [duration, setDuration] = useState(45)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [roleRes, candRes, roundsRes] = await Promise.all([
        fetch(`/api/agency/roles/${roleId}`),
        fetch(`/api/agency/roles/${roleId}/candidates`),
        fetch(`/api/agency/roles/${roleId}/rounds`),
      ])
      if (roleRes.status === 401) return router.push("/agencies")
      if (roleRes.ok) {
        const body = await roleRes.json()
        if (body?.role) setRole({ ref: body.role.ref, title: body.role.title })
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

  /** Derived for display only — the server derives the real one, so the two
   * agreeing is a courtesy and the server is the authority. */
  const nextRound = useMemo(() => {
    if (!candidateId) return 1
    const mine = rounds.filter((r) => r.candidateId === candidateId && r.status !== "cancelled")
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
        <div>
          <div className="ag-rail-label">Navigate</div>
          <button className="ag-step" onClick={() => router.push("/agencies")}>Roles</button>
          <button className="ag-step" onClick={() => router.push(`/agencies/roles/${roleId}`)}>
            This role
          </button>
          <button className="ag-step on" aria-current="page">Interviews</button>
        </div>
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
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <button className="ag-crumb-link" onClick={() => router.push(`/agencies/roles/${roleId}`)}>
                {role?.ref || "Role"}
              </button>
              {" / "}
              <b>Interviews</b>
            </span>
            <span className="ag-grow" />
            <button
              className="ag-btn ag-btn-secondary"
              onClick={() => router.push(`/agencies/roles/${roleId}`)}
            >
              ← Back to role
            </button>
          </div>

          <p className="ag-step-eyebrow">Book an interview</p>
          <h1 className="ag-title">
            {client?.contactName ? `Put someone in ${client.contactName.split(" ")[0]}’s diary` : "Book an interview"}
          </h1>
          <p className="ag-sub">
            {slots === null
              ? "Loading the client’s windows…"
              : slots.length > 0
                ? `${client?.company || "Your client"} has offered ${slots.length} window${slots.length === 1 ? "" : "s"}. Pick who meets them — the time comes out of the client’s own diary, so booking one takes it off the board for everyone.`
                : "Your client has not offered any times yet. They add them from their own workspace, and they appear here the moment they do."}
          </p>

          {error && (
            <p className="ag-banner" role="alert">
              {error}
            </p>
          )}

          {slots !== null && slots.length > 0 && (
            <>
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
                  Tailr does not host or record this call yet. Use your own meeting link; recording,
                  transcripts and per-round enrichment are not built, and no candidate has been
                  asked to consent to any of it.
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
                  <div key={r.id} className="ag-card ag-booked">
                    <span className="ag-grow" style={{ minWidth: 0 }}>
                      <span className="ag-meta">
                        {r.candidateRef} · round {r.roundNumber}
                        {r.status !== "scheduled" ? ` · ${r.status}` : ""}
                      </span>
                      <span className="ag-pick-name">{r.candidateName}</span>
                      <span className="ag-meta">
                        {r.scheduledAt ? `${fmtDay(r.scheduledAt)}, ${fmtTime(r.scheduledAt)}` : "No time"}
                        {` · ${r.durationMinutes} min`}
                        {r.meetingUrl ? " · link added" : " · no link"}
                      </span>
                    </span>
                    {r.status === "scheduled" && (
                      <>
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={() => setStatus(r.id, "completed")}
                          disabled={busy}
                        >
                          Mark done
                        </button>
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={() => setStatus(r.id, "cancelled")}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="ag-note-quiet" style={{ marginTop: 28 }}>
            Booking takes the time off the client’s board · cancelling gives it back.
          </p>
        </div>
      </main>
    </>
  )
}
