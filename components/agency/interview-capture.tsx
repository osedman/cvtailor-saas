"use client"

/**
 * Interview capture, on a round — built to Figma "Recruiter · Interview
 * capture — the five states" (page 02, signed off 17 Aug).
 *
 * ⚠ GATED. No real candidate until the DPIA and the consent-copy review are
 * done, and no real transcription vendor is wired in. The synthetic provider
 * makes this walkable end to end today.
 *
 * Two decisions from the frame, both load-bearing:
 *
 * 1. WITHOUT CONSENT THERE IS NO UPLOAD CONTROL — absent, not disabled. A
 *    greyed-out button next to "she has not agreed" invites the recruiter to
 *    wonder how to enable it. Absence says the question is not theirs. This
 *    is a deliberate departure from the Fill-from-transcript precedent
 *    (disabled with a reason), because that precedent is about features we
 *    have not built, and this is about a decision somebody else has made.
 *
 * 2. NAMING THE SPEAKER *IS* THE VERIFICATION, AND VERIFICATION IS WHAT
 *    DELETES THE AUDIO. One click does all three, and the copy says so
 *    before it happens. Diarization returns "speaker 0, speaker 1"; only the
 *    candidate's own words may become their evidence, so a person has to say
 *    which is which — and the promise made to the candidate is that the
 *    recording goes as soon as a person has checked the transcript.
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
}

const ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/flac"

const CHIP: Record<CaptureView["state"], { label: string; tone: string }> = {
  no_consent: { label: "BLOCKED", tone: "var(--ag-coral-text)" },
  ready: { label: "READY", tone: "var(--ag-calm)" },
  uploaded: { label: "UPLOADED", tone: "var(--ag-warn)" },
  transcribing: { label: "IN PROGRESS", tone: "var(--ag-warn)" },
  failed: { label: "FAILED", tone: "var(--ag-coral-text)" },
  needs_check: { label: "YOUR MOVE", tone: "var(--ag-coral-text)" },
  verified: { label: "DONE", tone: "var(--ag-calm)" },
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="ag-capture-note"
      style={{
        borderLeft: "3px solid var(--ag-warn)",
        background: "var(--ag-tint-1)",
        color: "var(--ag-warn)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        margin: "12px 0 0",
      }}
    >
      {children}
    </p>
  )
}

export function InterviewCapture({
  roundId,
  candidateName,
}: {
  roundId: string
  candidateName: string
}) {
  const [view, setView] = useState<CaptureView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
      toast.success("Queued. Transcription runs on the job queue, not in this page.")
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
        toast.success("Checked. The recording will be deleted by tonight's sweep.")
        await load()
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setBusy(null)
      }
    },
    [roundId, load]
  )

  if (!view) {
    return (
      <div className="ag-card" style={{ padding: 20 }}>
        <span className="ag-meta">Loading capture…</span>
      </div>
    )
  }

  const chip = CHIP[view.state]

  return (
    <section className="ag-card" style={{ padding: "20px 24px" }} aria-labelledby={`cap-${roundId}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 id={`cap-${roundId}`} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Interview capture
        </h3>
        <span style={{ flex: 1 }} />
        <span className="ag-meta" style={{ color: chip.tone }}>{chip.label}</span>
      </div>

      {/* ── 01 · no consent ─────────────────────────────────────────── */}
      {view.state === "no_consent" && (
        <>
          <p className="ag-note" style={{ marginTop: 10 }}>
            {candidateName} has not agreed to this interview being recorded, so there is nothing to
            upload. The ask goes out on their own link, and the answer is theirs — nobody here can
            give it for them.
          </p>
          <Note>
            The people interviewing them are never told what they chose. That is a promise in the
            consent copy, and the hiring-manager view omits the field so it cannot be broken by
            accident.
          </Note>
        </>
      )}

      {/* ── 02 · consented, no recording ────────────────────────────── */}
      {view.state === "ready" && (
        <>
          <p className="ag-note" style={{ marginTop: 10 }}>
            {candidateName} agreed. Tailr does not host or record the call — record it yourself and
            upload the audio here afterwards. Audio only: we keep no video of anyone&rsquo;s face
            for a feature that reads words.
          </p>
          <label className="ag-btn ag-btn-primary" style={{ marginTop: 14, display: "inline-flex", cursor: busy ? "default" : "pointer" }}>
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
        </>
      )}

      {/* ── 03 · uploaded / transcribing / failed ───────────────────── */}
      {(view.state === "uploaded" || view.state === "transcribing" || view.state === "failed") && (
        <>
          <p className="ag-note" style={{ marginTop: 10 }}>
            {view.state === "uploaded" &&
              "The recording is stored. Transcription runs on a queue, not in this page — a long interview takes minutes, and a browser tab closing must not lose it. The audio stays exactly where it is until the transcript is checked."}
            {view.state === "transcribing" &&
              "Transcribing. This runs on the job queue; come back to it — nothing is lost if you navigate away."}
            {view.state === "failed" &&
              "That transcription failed. The audio has not been touched, so it can be tried again."}
          </p>
          {view.state === "failed" && view.jobError && (
            <p className="ag-meta" style={{ marginTop: 8, color: "var(--ag-coral-text)" }}>
              {view.jobError}
            </p>
          )}
          {view.state !== "transcribing" && (
            <button
              className="ag-btn ag-btn-primary"
              style={{ marginTop: 14 }}
              onClick={() => void transcribe()}
              disabled={busy != null}
              aria-busy={busy === "transcribe"}
            >
              {busy === "transcribe" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {view.state === "failed" ? "Try transcribing again" : "Transcribe this recording"}
            </button>
          )}
        </>
      )}

      {/* ── 04 · transcribed, needs checking ────────────────────────── */}
      {view.state === "needs_check" && (
        <>
          <p className="ag-note" style={{ marginTop: 10 }}>
            {view.segmentCount} segments, {view.speakers.length} speakers. Read the transcript, then
            say which voice is {candidateName} — the transcriber labels speakers by number and does
            not know their names. Only their own words can become their evidence, so this is not
            something we guess.
          </p>
          <Note>
            Confirming does two things at once, deliberately: it accepts the transcript AND releases
            the recording for deletion. {candidateName} was promised the audio goes as soon as a
            person has checked it.
          </Note>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            {view.speakers.map((s) => (
              <button
                key={s}
                className="ag-btn"
                onClick={() => void verify(s)}
                disabled={busy != null}
                aria-busy={busy === `verify-${s}`}
              >
                {busy === `verify-${s}` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Speaker {s} is {candidateName}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── 05 · checked ────────────────────────────────────────────── */}
      {view.state === "verified" && (
        <p className="ag-note" style={{ marginTop: 10 }}>
          Checked{view.verifiedAt ? ` on ${new Date(view.verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}.
          Speaker {view.candidateSpeaker} is {candidateName}.{" "}
          {view.audioDeleted
            ? "The recording has been deleted."
            : "The recording will be deleted by tonight's sweep."}{" "}
          The transcript stays, and the quotes drawn from it carry the round they came from. Nothing
          here scores how they sounded — only what they said, against the requirements.
        </p>
      )}
    </section>
  )
}
