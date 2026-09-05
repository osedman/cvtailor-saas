"use client"

/**
 * Set up interviews — the client's one task after a submission.
 *
 * Two steps on one screen. First, who to interview: the frozen shortlist
 * the recruiter addressed to this contact, each candidate a choice between
 * "interview" and "not for this role" (a signal, never a removal). Second,
 * when: the product scans the calendar of their choice for busy time and
 * proposes windows sized to the number of candidates chosen — one each plus
 * half again, spread across at least two working days — or, with no
 * calendar connected, proposes the same shape across a range of days they
 * pick. They untick what they do not want and confirm. Decisions and
 * windows land as one act, and the recruiter's next action becomes "book
 * round 1".
 *
 * Proposals are computed here, in the browser, because this is where the
 * hiring manager's time zone is known for free; the tokens never leave the
 * server, only busy intervals do.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import "../../../hiring.css"
import { HiringNav, EmptyBand } from "@/components/agency/hm-shared"
import { RoleHeader, announceRoleChanged } from "@/components/agency/role-header"
import { SignOut } from "@/components/agency/sign-out"
import { proposeWindows, windowsWanted, type Interval } from "@/lib/calendar/windows"

interface Entry {
  ref: string
  fullName: string
  currentTitle: string | null
  location: string | null
  years: number | null
  redacted: boolean
  action: string | null
}
interface Shortlist {
  generatedAt: string
  intro: string
  entries: Entry[]
}
interface CalendarStatus {
  connection: { provider: string; label: string; connectedAt: string } | null
  providers: Array<{ key: string; label: string; configured: boolean }>
}
type Choice = "interview" | "decline" | ""

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export default function SetUpInterviewsPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const router = useRouter()
  const [screen, setScreen] = useState<"loading" | "ready" | "none" | "unauthed" | "error">("loading")
  const [shortlist, setShortlist] = useState<Shortlist | null>(null)
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [duration, setDuration] = useState(45)
  const [busy, setBusy] = useState<Interval[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [rangeFrom, setRangeFrom] = useState(() => toDateInput(new Date(Date.now() + 86_400_000)))
  const [rangeDays, setRangeDays] = useState(10)
  const [proposed, setProposed] = useState<Interval[] | null>(null)
  const [short, setShort] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ interviewed: number; declined: number; offered: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetch(`/api/hiring/roles/${roleId}/shortlist`), fetch("/api/hiring/calendar/status")])
      if (s.status === 401) return setScreen("unauthed")
      if (s.status === 404) return setScreen("none")
      if (!s.ok) return setScreen("error")
      const body = (await s.json()) as { shortlist: Shortlist }
      setShortlist(body.shortlist)
      const initial: Record<string, Choice> = {}
      for (const e of body.shortlist.entries) initial[e.ref] = e.action === "interview" || e.action === "approve" ? "interview" : e.action === "decline" ? "decline" : ""
      setChoices(initial)
      if (c.ok) setCalendar((await c.json()) as CalendarStatus)
      setScreen("ready")
    } catch {
      setScreen("error")
    }
  }, [roleId])

  useEffect(() => {
    void load()
  }, [load])

  const chosen = useMemo(() => Object.entries(choices).filter(([, c]) => c === "interview").map(([ref]) => ref), [choices])
  const wanted = windowsWanted(chosen.length)
  // Read off the URL rather than useSearchParams so this page needs no
  // Suspense boundary — the same choice the workflow page makes.
  const [calendarNote, setCalendarNote] = useState<string | null>(null)
  useEffect(() => {
    setCalendarNote(new URLSearchParams(window.location.search).get("calendar"))
  }, [])

  async function scan() {
    setScanning(true)
    setScanError(null)
    try {
      const from = new Date(`${rangeFrom}T00:00:00`)
      const to = new Date(from.getTime() + rangeDays * 86_400_000)
      const res = await fetch(`/api/hiring/calendar/busy?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setScanError(typeof body?.error === "string" ? body.error : "Could not read your calendar.")
        return
      }
      const intervals = (body.busy ?? []) as Interval[]
      setBusy(intervals)
      propose(intervals)
    } catch {
      setScanError("Could not read your calendar.")
    } finally {
      setScanning(false)
    }
  }

  function propose(intervals: Interval[]) {
    const from = new Date(`${rangeFrom}T00:00:00`)
    const p = proposeWindows({ candidates: chosen.length, durationMinutes: duration, busy: intervals, from, days: rangeDays })
    setProposed(p.windows)
    setShort(p.short)
    setPicked(new Set(p.windows.map((w) => w.start)))
  }

  async function confirm() {
    if (!shortlist) return
    setSubmitting(true)
    setError(null)
    try {
      const fresh = shortlist.entries.filter((e) => !e.action)
      const decisions = fresh
        .map((e) => ({ ref: e.ref, action: choices[e.ref] }))
        .filter((d): d is { ref: string; action: "interview" | "decline" } => d.action === "interview" || d.action === "decline")
      let written = 0
      if (decisions.length > 0) {
        const r = await fetch(`/api/hiring/roles/${roleId}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions }),
        })
        const b = await r.json().catch(() => ({}))
        if (!r.ok) {
          setError(typeof b?.error === "string" ? b.error : "Could not record your decisions.")
          return
        }
        written = Array.isArray(b?.written) ? b.written.length : 0
      }
      const windows = (proposed ?? []).filter((w) => picked.has(w.start))
      let offered = 0
      if (windows.length > 0) {
        const r = await fetch(`/api/hiring/roles/${roleId}/windows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ windows }),
        })
        const b = await r.json().catch(() => ({}))
        if (!r.ok && !(Array.isArray(b?.offered) && b.offered.length > 0)) {
          setError(typeof b?.error === "string" ? b.error : typeof b?.failed?.error === "string" ? b.failed.error : "Could not offer those times.")
          return
        }
        offered = Array.isArray(b?.offered) ? b.offered.length : 0
        if (b?.failed) setError(`${offered} offered, then: ${b.failed.error}`)
      }
      void written
      setDone({
        interviewed: chosen.length,
        declined: Object.values(choices).filter((c) => c === "decline").length,
        offered,
      })
      announceRoleChanged()
    } catch {
      setError("Something went wrong. Nothing you had already confirmed is lost.")
    } finally {
      setSubmitting(false)
    }
  }

  const connected = calendar?.connection ?? null
  const providers = calendar?.providers ?? []

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <span className="agd-crumb">
          <Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> /{" "}
          <Link href={`/hiring/roles/${roleId}`} style={{ color: "inherit", textDecoration: "none" }}>Role</Link> / Set up interviews
        </span>
        <span className="agd-spacer" />
        {screen === "ready" && (
          <>
            <span className="ag-pill hm-role-chip">Hiring manager</span>
            <SignOut door="consumer" />
          </>
        )}
      </div>
      {screen === "ready" && <HiringNav />}

      <div className="agd-page" aria-busy={screen === "loading"}>
        {screen === "loading" && (
          <div className="ag-card"><div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}><span className="ag-spin" /></div></div>
        )}
        {screen === "unauthed" && <EmptyBand title="Sign in to set up interviews." body="Sign in from the dashboard first." />}
        {screen === "none" && (
          <EmptyBand title="No shortlist on this role yet." body="When your recruiter sends one, this is where you choose who to interview and offer times." />
        )}
        {screen === "error" && <EmptyBand title="We could not load this shortlist." body="Reload the page. If it keeps failing, tell your recruiter." />}

        {screen === "ready" && shortlist && (
          <>
            <RoleHeader roleId={roleId} hat="client" />

            {calendarNote === "connected" && (
              <p className="ag-banner" role="status">Calendar connected. Scan it below and we will propose interview windows.</p>
            )}
            {calendarNote && calendarNote !== "connected" && (
              <p className="ag-banner" role="alert">The calendar was not connected ({calendarNote.replace(/-/g, " ")}). You can still pick a range of days below.</p>
            )}

            {done ? (
              <section className="agd-band">
                <div className="ag-receipt" role="status">
                  <div className="ag-receipt-head">
                    <span className="ag-receipt-eyebrow">Confirmed</span>
                    <span className="ag-receipt-confirmed">
                      {done.interviewed} to interview{done.declined ? `, ${done.declined} not for this role` : ""}
                      {done.offered ? `, ${done.offered} interview windows offered` : ", no windows offered yet"}.
                    </span>
                  </div>
                  <div className="ag-receipt-cells">
                    <div className="ag-receipt-cell"><span className="ag-receipt-label">Now owned by</span><span className="ag-receipt-value">Your recruiter</span></div>
                    <div className="ag-receipt-cell"><span className="ag-receipt-label">Their next task</span><span className="ag-receipt-value">{done.offered ? `Book round 1 for ${done.interviewed} candidate${done.interviewed === 1 ? "" : "s"} into your windows.` : "Wait for your interview windows, then book round 1."}</span></div>
                    <div className="ag-receipt-cell"><span className="ag-receipt-label">Then</span><span className="ag-receipt-value">Each candidate confirms; the rounds land in your diary; you write each one up before deciding.</span></div>
                  </div>
                </div>
                <p style={{ marginTop: 14 }}>
                  <Link className="agd-tbtn primary" href={`/hiring/roles/${roleId}`}>Back to the role →</Link>
                </p>
              </section>
            ) : (
              <>
                <section className="agd-band" aria-labelledby="setup-who">
                  <div className="agd-eyebrow-row">
                    <h2 className="agd-eyebrow" id="setup-who">1 · Who do you want to interview?</h2>
                    <span className="agd-rule" />
                    <span className="agd-aside">{shortlist.entries.length} shortlisted · {chosen.length} chosen</span>
                  </div>
                  {shortlist.intro && <p className="agd-sub" style={{ marginBottom: 12 }}>{shortlist.intro}</p>}
                  <div className="hm-setup-list">
                    {shortlist.entries.map((e) => {
                      const locked = !!e.action
                      const c = choices[e.ref] ?? ""
                      return (
                        <div key={e.ref} className={`hm-setup-row${c === "interview" ? " chosen" : ""}`}>
                          <div className="hm-setup-who">
                            <span className="hm-setup-name">{e.redacted ? `Candidate ${e.ref}` : e.fullName || `Candidate ${e.ref}`}</span>
                            <span className="ag-meta">
                              {e.ref}
                              {e.currentTitle ? ` · ${e.currentTitle}` : ""}
                              {e.location ? ` · ${e.location}` : ""}
                            </span>
                          </div>
                          {locked ? (
                            <span className="ag-pill">{e.action === "decline" ? "Not for this role" : e.action === "question" ? "You asked a question" : "Interview"} · already decided</span>
                          ) : (
                            <div className="agd-seg" role="group" aria-label={`Decision for ${e.ref}`}>
                              <button type="button" aria-pressed={c === "interview"} onClick={() => setChoices((p) => ({ ...p, [e.ref]: c === "interview" ? "" : "interview" }))}>Interview</button>
                              <button type="button" aria-pressed={c === "decline"} onClick={() => setChoices((p) => ({ ...p, [e.ref]: c === "decline" ? "" : "decline" }))}>Not for this role</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="agd-aside" style={{ marginTop: 10 }}>
                    Full evidence for each candidate is in the shortlist your recruiter sent you. "Not for this role" is a signal to your recruiter, not a removal.
                  </p>
                </section>

                <section className="agd-band" aria-labelledby="setup-when">
                  <div className="agd-eyebrow-row">
                    <h2 className="agd-eyebrow" id="setup-when">2 · When can you interview?</h2>
                    <span className="agd-rule" />
                    <span className="agd-aside">{chosen.length === 0 ? "choose candidates first" : `we will propose ${wanted} windows for ${chosen.length}`}</span>
                  </div>

                  <div className="hm-setup-controls">
                    <label className="hm-field">
                      <span className="hm-field-label">Interview length</span>
                      <select className="ag-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                        <option value={30}>30 minutes</option>
                        <option value={45}>45 minutes</option>
                        <option value={60}>60 minutes</option>
                      </select>
                    </label>
                    <label className="hm-field">
                      <span className="hm-field-label">From</span>
                      <input className="ag-input" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
                    </label>
                    <label className="hm-field">
                      <span className="hm-field-label">Across</span>
                      <select className="ag-input" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
                        <option value={5}>5 days</option>
                        <option value={10}>10 days</option>
                        <option value={14}>14 days</option>
                        <option value={21}>21 days</option>
                      </select>
                    </label>
                  </div>

                  <div className="hm-setup-source">
                    {connected ? (
                      <>
                        <span className="ag-pill">{connected.label} connected</span>
                        <button type="button" className="agd-tbtn primary" disabled={scanning || chosen.length === 0} onClick={() => void scan()}>
                          {scanning ? "Scanning…" : `Scan my ${connected.label}`}
                        </button>
                        <button type="button" className="agd-tbtn" disabled={chosen.length === 0} onClick={() => propose([])}>
                          Propose without scanning
                        </button>
                      </>
                    ) : (
                      <>
                        {providers.map((p) =>
                          p.configured ? (
                            <a key={p.key} className="agd-tbtn" href={`/api/hiring/calendar/connect?provider=${p.key}&next=${encodeURIComponent(`/hiring/roles/${roleId}/interviews`)}`}>
                              Connect {p.label}
                            </a>
                          ) : (
                            <span key={p.key} className="agd-tbtn" aria-disabled="true" title="Not set up on this environment yet" style={{ opacity: 0.55, cursor: "not-allowed" }}>
                              Connect {p.label} · not set up yet
                            </span>
                          )
                        )}
                        <button type="button" className="agd-tbtn primary" disabled={chosen.length === 0} onClick={() => propose([])}>
                          Propose windows across these days
                        </button>
                      </>
                    )}
                  </div>
                  {scanError && <p className="ag-banner" role="alert">{scanError}</p>}
                  {busy && <p className="agd-aside">Read {busy.length} busy span{busy.length === 1 ? "" : "s"} from your calendar. Nothing about them is stored.</p>}

                  {proposed && (
                    <div className="hm-setup-windows">
                      {short && (
                        <p className="ag-banner" role="status">
                          Only {proposed.length} of {wanted} windows fit inside those days around your calendar. Widen the range, or confirm these and offer more later.
                        </p>
                      )}
                      {proposed.length === 0 && !short && <p className="agd-aside">No windows proposed.</p>}
                      {proposed.map((w) => {
                        const on = picked.has(w.start)
                        return (
                          <label key={w.start} className={`hm-setup-window${on ? " on" : ""}`}>
                            <input type="checkbox" checked={on} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(w.start)) n.delete(w.start); else n.add(w.start); return n })} />
                            <span className="hm-setup-window-day">{fmtDay(w.start)}</span>
                            <span className="hm-setup-window-time">{fmtTime(w.start)} – {fmtTime(w.end)}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="agd-band">
                  {error && <p className="ag-banner" role="alert">{error}</p>}
                  <div className="hm-brief-actions">
                    <button type="button" className="agd-tbtn primary" disabled={submitting || (chosen.length === 0 && !Object.values(choices).includes("decline"))} onClick={() => void confirm()}>
                      {submitting ? "Confirming…" : `Confirm ${chosen.length} to interview${picked.size ? ` and offer ${picked.size} windows` : ""}`}
                    </button>
                    <button type="button" className="agd-tbtn" onClick={() => router.push(`/hiring/roles/${roleId}`)}>Not now</button>
                  </div>
                  <p className="agd-aside" style={{ marginTop: 8 }}>
                    Your recruiter books each candidate into one of your windows; the candidate confirms; it lands in your diary.
                  </p>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
