"use client"

/**
 * The recording panel on a round — frame 47 §A "The recording panel on a
 * round (recruiter)", signed off by Ose 14 Nov 2026. Supersedes the 17 Aug
 * "five states" frame (159:2).
 *
 * ⚠ GATED. No real candidate until a transcription vendor is named in the DPA.
 * The synthetic provider makes this walkable end to end today.
 *
 * What the frame changed, and why each is load-bearing:
 *
 * 1. ASKED IS A STATE. Asking used to leave the round reading "not asked", and
 *    asking again silently killed the first email's link. Now the panel says
 *    when the candidate was asked, a reminder sends another working link, and
 *    "Copy their link" mints one without emailing.
 *
 * 2. THE ANSWER IS THE CANDIDATE'S. Nothing here can give it. The recruiter
 *    sees it (they act on it); the hiring manager never does — their view
 *    omits the field and a test fails the build if it ever appears.
 *
 * 3. WITHOUT CONSENT THERE IS NO UPLOAD CONTROL — absent, not disabled.
 *
 * 4. READ BEFORE YOU NAME A VOICE. The transcript is on the panel at the
 *    speaker check. Naming the voice verifies the transcript, which releases
 *    the audio for deletion, and then reads the candidate's own lines into
 *    quotes against the requirements.
 *
 * 5. WITHDRAWAL IS REAL. The audio, transcript and quotes are deleted and the
 *    candidate is rescored before they are told it is done.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { errorMessage } from "@/lib/error-message"

interface CaptureView {
  state: "no_consent" | "ready" | "uploaded" | "transcribing" | "failed" | "needs_check" | "verified"
  consentStatus: string
  hasRecording: boolean
  audioDeleted: boolean
  segmentCount: number
  speakers: number[]
  candidateSpeaker: number | null
  verifiedAt: string | null
  jobStatus: string | null
  jobError: string | null
  requestedAt: string | null
  remindedAt: string | null
  answeredAt: string | null
  lines: Array<{ speaker: number; start: number; text: string }>
  quotes: Array<{ ref: string; requirement: string; weight: string; strength: string; quote: string; source: string }>
}

type Panel =
  | "not_asked"
  | "waiting"
  | "declined"
  | "withdrawn"
  | "ready"
  | "uploaded"
  | "transcribing"
  | "failed"
  | "needs_check"
  | "verified"

const ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/flac"
const PREVIEW_LINES = 4

/** Chip copy per frame 47: plain words, sentence case. */
const CHIP: Record<Panel, { label: string; tone: "off" | "wait" | "ok" | "act" }> = {
  not_asked: { label: "Not asked", tone: "off" },
  waiting: { label: "Waiting", tone: "wait" },
  declined: { label: "Declined", tone: "off" },
  withdrawn: { label: "Withdrawn", tone: "off" },
  ready: { label: "Ready", tone: "ok" },
  uploaded: { label: "Uploaded", tone: "wait" },
  transcribing: { label: "In progress", tone: "off" },
  failed: { label: "Failed", tone: "act" },
  needs_check: { label: "Your move", tone: "act" },
  verified: { label: "Done", tone: "ok" },
}

export function panelFor(view: CaptureView): Panel {
  if (view.state !== "no_consent") return view.state
  if (view.consentStatus === "declined") return "declined"
  if (view.consentStatus === "withdrawn") return "withdrawn"
  return view.requestedAt ? "waiting" : "not_asked"
}

function day(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function New({ children }: { children: React.ReactNode }) {
  return <p className="ag-capture-note">{children}</p>
}

export function InterviewCapture({
  roundId,
  roleId,
  roundNumber,
  scheduled,
  candidateName,
}: {
  roundId: string
  roleId: string
  roundNumber: number
  /** Only a round still in the diary can be asked about. */
  scheduled: boolean
  candidateName: string
}) {
  const [view, setView] = useState<CaptureView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [readAll, setReadAll] = useState(false)
  const first = candidateName.split(/\s+/)[0] || candidateName

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/rounds/${roundId}/capture`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Could not read this round.")
      setView(data as CaptureView)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }, [roundId])

  useEffect(() => {
    void load()
  }, [load])

  /** Ask, remind (send: true) or mint a link to copy (send: false). */
  const ask = useCallback(
    async (send: boolean) => {
      setBusy(send ? "ask" : "copy")
      try {
        const res = await fetch(`/api/agency/roles/${roleId}/consent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, send }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Could not do that.")
        const url = String(body.url ?? "")
        if (!send || !body.emailed) {
          await navigator.clipboard?.writeText(url).catch(() => undefined)
          toast.success(
            send
              ? `There is no email on file for ${first}, so the link is copied. Send it to them yourself.`
              : "Their link is copied. Earlier links keep working."
          )
        } else {
          toast.success(body.resend ? `Reminder sent to ${first}.` : `Asked ${first}. Their answer is theirs.`)
        }
        await load()
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setBusy(null)
      }
    },
    [roleId, roundId, first, load]
  )

  /** Mint → upload straight to storage → confirm. The bytes never come
   *  through our routes; the ticket is minted only after the consent check. */
  const upload = useCallback(
    async (file: File) => {
      setBusy("upload")
      try {
        const mintRes = await fetch(`/api/agency/rounds/${roundId}/recording`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType: file.type }),
        })
        const ticket = await mintRes.json()
        if (!mintRes.ok) throw new Error(ticket?.error || "Could not start the upload.")

        const supabase = createClient()
        const { error: upErr } = await supabase.storage
          .from(ticket.bucket)
          .uploadToSignedUrl(ticket.path, ticket.token, file)
        if (upErr) throw new Error(upErr.message)

        const confirmRes = await fetch(`/api/agency/rounds/${roundId}/recording`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: ticket.path }),
        })
        const confirmed = await confirmRes.json()
        if (!confirmRes.ok) throw new Error(confirmed?.error || "The upload did not complete.")

        toast.success("Recording uploaded. Nothing is transcribed until you ask for it.")
        await load()
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setBusy(null)
      }
    },
    [roundId, load]
  )

  const transcribe = useCallback(async () => {
    setBusy("transcribe")
    try {
      const res = await fetch(`/api/agency/rounds/${roundId}/transcript`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Could not queue that.")
      toast.success("Transcribing. Come back later; nothing is lost if you leave.")
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }, [roundId, load])

  /** Read the candidate's own lines into quotes against the requirements. */
  const addQuotes = useCallback(async () => {
    setBusy("quotes")
    try {
      const res = await fetch(`/api/agency/rounds/${roundId}/enrich`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Could not read the transcript.")
      toast.success(
        data.wrote === 1 ? "1 quote added to their evidence." : `${data.wrote ?? 0} quotes added to their evidence.`
      )
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }, [roundId, load])

  const verify = useCallback(
    async (speaker: number) => {
      setBusy(`verify-${speaker}`)
      try {
        const res = await fetch(`/api/agency/rounds/${roundId}/transcript`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateSpeaker: speaker }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Could not confirm that.")
        toast.success("Checked. The recording is deleted tonight.")
      } catch (err) {
        toast.error(errorMessage(err))
        setBusy(null)
        return
      }
      // Card 5 → card 6: the check is done, now read their own lines.
      await addQuotes()
    },
    [roundId, addQuotes]
  )

  if (!view) {
    return (
      <div className="ag-capture">
        <span className="ag-meta">Loading…</span>
      </div>
    )
  }

  const panel = panelFor(view)
  const chip = CHIP[panel]
  const shown = readAll ? view.lines : view.lines.slice(0, PREVIEW_LINES)

  return (
    <section className={`ag-capture${panel === "not_asked" ? " is-idle" : ""}`} aria-labelledby={`cap-${roundId}`}>
      <div className="ag-capture-head">
        <h3 id={`cap-${roundId}`} className="ag-capture-title">
          {panel === "not_asked" && "Recording · not asked"}
          {panel === "waiting" && `Asked ${day(view.requestedAt)} · no answer yet`}
          {panel === "declined" && "No recording for this round"}
          {panel === "withdrawn" && `Withdrawn ${day(view.answeredAt)}`}
          {panel === "ready" && `${first} agreed${view.answeredAt ? ` · ${day(view.answeredAt)}` : ""}`}
          {(panel === "uploaded" || panel === "failed") && "Recording uploaded"}
          {panel === "transcribing" && "Transcribing"}
          {panel === "needs_check" && `Which voice is ${first}?`}
          {panel === "verified" &&
            `Checked ${day(view.verifiedAt)} · Speaker ${view.candidateSpeaker} is ${first}.${view.audioDeleted ? " Recording deleted." : ""}`}
        </h3>
        <span className="ag-grow" />
        <span className={`ag-capture-chip is-${chip.tone}`}>{chip.label}</span>
      </div>

      {panel === "not_asked" && (
        <>
          <p className="ag-note">
            {first} gets an email asking whether this round may be recorded. Their answer is theirs to give.
          </p>
          {scheduled && (
            <div className="ag-capture-actions">
              <button className="ag-btn ag-btn-secondary" onClick={() => void ask(true)} disabled={busy != null} aria-busy={busy === "ask"}>
                {busy === "ask" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Ask {first}
              </button>
            </div>
          )}
        </>
      )}

      {panel === "waiting" && (
        <>
          <p className="ag-note">
            {view.remindedAt
              ? `Reminded ${day(view.remindedAt)}. Until ${first} says yes, the round is written up instead.`
              : `If they have not answered, they get one reminder the day before the round. Until ${first} says yes, the round is written up instead.`}
          </p>
          {scheduled && (
            <div className="ag-capture-actions">
              <button className="ag-btn ag-btn-secondary" onClick={() => void ask(true)} disabled={busy != null} aria-busy={busy === "ask"}>
                {busy === "ask" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Send a reminder now
              </button>
              <button className="ag-btn ag-btn-secondary" onClick={() => void ask(false)} disabled={busy != null} aria-busy={busy === "copy"}>
                {busy === "copy" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Copy their link
              </button>
            </div>
          )}
        </>
      )}

      {panel === "declined" && (
        <p className="ag-note">
          {first} said no. Round {roundNumber} is written up instead, and the write-up counts as evidence the same way.
        </p>
      )}

      {panel === "withdrawn" && (
        <p className="ag-note">
          Recording, transcript and quotes from round {roundNumber} deleted. Their score is updated.
        </p>
      )}

      {panel === "ready" && (
        <>
          <p className="ag-note">Record the call yourself and upload the audio here afterwards. Audio only.</p>
          <div className="ag-capture-actions">
            <label className="ag-btn ag-btn-primary" style={{ cursor: busy ? "default" : "pointer" }}>
              {busy === "upload" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy === "upload" ? "Uploading…" : "Upload the recording"}
              <input
                type="file"
                accept={ACCEPT}
                disabled={busy != null}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void upload(f)
                  e.target.value = ""
                }}
              />
            </label>
          </div>
        </>
      )}

      {(panel === "uploaded" || panel === "failed" || panel === "transcribing") && (
        <>
          <p className="ag-note">
            {panel === "uploaded" && "The audio is kept until you check the transcript."}
            {panel === "transcribing" && "Transcribing — come back later. The audio is kept until you check the transcript."}
            {panel === "failed" && "That transcription failed. The audio is untouched, so it can be tried again."}
          </p>
          {panel === "failed" && view.jobError && <p className="ag-meta ag-capture-error">{view.jobError}</p>}
          {panel !== "transcribing" && (
            <div className="ag-capture-actions">
              <button className="ag-btn ag-btn-primary" onClick={() => void transcribe()} disabled={busy != null} aria-busy={busy === "transcribe"}>
                {busy === "transcribe" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {panel === "failed" ? "Try again" : "Transcribe"}
              </button>
            </div>
          )}
        </>
      )}

      {panel === "needs_check" && (
        <>
          <div className="ag-transcript" role="list" aria-label="Transcript">
            {shown.map((l, i) => (
              <div key={i} className="ag-transcript-line" role="listitem">
                <span className="ag-transcript-who">
                  Speaker {l.speaker} · {clock(l.start)}
                </span>
                <span className="ag-transcript-text">{l.text}</span>
              </div>
            ))}
            {view.lines.length > PREVIEW_LINES && (
              <button className="ag-transcript-more" onClick={() => setReadAll((v) => !v)}>
                {readAll ? "Show less" : `Showing ${PREVIEW_LINES} of ${view.segmentCount} lines · Read all`}
              </button>
            )}
          </div>
          <div className="ag-capture-actions">
            {view.speakers.map((s) => (
              <button
                key={s}
                className="ag-btn ag-btn-secondary"
                onClick={() => void verify(s)}
                disabled={busy != null}
                aria-busy={busy === `verify-${s}`}
              >
                {busy === `verify-${s}` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Speaker {s} is {first}
              </button>
            ))}
          </div>
          <New>Choosing confirms the transcript, and the audio is deleted tonight.</New>
        </>
      )}

      {panel === "verified" && (
        <>
          {view.quotes.length > 0 ? (
            <>
              <p className="ag-capture-count">
                {view.quotes.length === 1 ? "1 quote" : `${view.quotes.length} quotes`} added to their evidence for round {roundNumber}
              </p>
              <ul className="ag-capture-quotes">
                {view.quotes.map((q) => (
                  <li key={q.ref} className="ag-capture-quote">
                    <span className="ag-capture-quote-req">
                      {q.requirement || q.ref}
                      <span className="ag-meta"> · {q.weight === "must" ? "Must-have" : "Nice-to-have"}</span>
                    </span>
                    <q>{q.quote}</q>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="ag-note">
                Quotes come only from {first}&rsquo;s own lines, word for word. Nothing scores how they sounded.
              </p>
              <div className="ag-capture-actions">
                <button className="ag-btn ag-btn-secondary" onClick={() => void addQuotes()} disabled={busy != null} aria-busy={busy === "quotes"}>
                  {busy === "quotes" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Add quotes from the transcript
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
