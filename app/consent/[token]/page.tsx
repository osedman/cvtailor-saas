"use client"

/**
 * The candidate's decision about their own voice.
 *
 * Copy: docs/CONSENT-COPY-DRAFT.md §3. This is the most consequential screen in
 * the product for the person with the least power in the transaction, and it is
 * built to that:
 *
 *   - Both options are real radio buttons of equal weight. No pre-selection, no
 *     primary/secondary styling, no "recommended". A default IS an answer, and
 *     it would not be theirs.
 *   - "Either answer is completely fine" is above the choice, not below it.
 *   - The email's yes/no buttons pre-select nothing; ?a= only scrolls intent
 *     into view, and the person still presses save. A click in an email client
 *     — which may be a prefetcher — must never be a consent record.
 *   - Changing your mind is on the same screen as giving it, with equal
 *     prominence, because withdrawal must be as easy as consent (UK GDPR Art 7).
 *
 * No account, ever. The token is the whole credential.
 */

import { use, useCallback, useEffect, useState } from "react"

interface ConsentView {
  agencyName: string
  company: string
  roleTitle: string
  candidateFirstName: string
  scheduledAt: string | null
  durationMinutes: number
  retentionDays: number
  status: string
}

type Screen = "loading" | "invalid" | "ready" | "saved"

export default function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [screen, setScreen] = useState<Screen>("loading")
  const [view, setView] = useState<ConsentView | null>(null)
  const [choice, setChoice] = useState<"granted" | "declined" | "">("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/consent/${encodeURIComponent(token)}`)
      if (!res.ok) return setScreen("invalid")
      const body = (await res.json()) as { consent?: ConsentView }
      if (!body.consent) return setScreen("invalid")
      setView(body.consent)
      setScreen(body.consent.status === "pending" ? "ready" : "saved")
    } catch {
      setScreen("invalid")
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function save(decision: "granted" | "declined" | "withdrawn") {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/consent/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok) {
        setError("That did not save. Please try again.")
        return
      }
      await load()
    } catch {
      setError("That did not save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (screen === "loading") {
    return (
      <main className="cs-wrap">
        <p className="cs-quiet" aria-live="polite">
          Loading…
        </p>
      </main>
    )
  }

  if (screen === "invalid" || !view) {
    return (
      <main className="cs-wrap">
        <div className="cs-card">
          <h1 className="cs-title">This link isn&apos;t valid any more</h1>
          <p className="cs-body">
            It may have been used already, or the interview may have changed. Your recruiter can
            send you a new one — replying to their email is the quickest way.
          </p>
        </div>
      </main>
    )
  }

  const when = view.scheduledAt
    ? new Date(view.scheduledAt).toLocaleString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "your upcoming interview"

  if (screen === "saved") {
    const recorded = view.status === "granted"
    return (
      <main className="cs-wrap">
        <div className="cs-card">
          <p className="cs-eyebrow">
            {view.agencyName} · interview with {view.company}
          </p>
          <h1 className="cs-title">
            Your answer: {recorded ? "record it" : "do not record it"}
          </h1>

          {view.status === "withdrawn" ? (
            <p className="cs-body">
              Your answer has been changed to <b>not recorded</b>. The recording and its transcript
              have been deleted, along with anything drawn from them. Your recruiter has been told
              the recording is gone; they keep their own notes, as they would have had you declined
              at the start.
            </p>
          ) : (
            <p className="cs-body">
              You can change this at any time, including after the interview. If you change it after
              a recording has been made, the recording and everything drawn from it is deleted.
            </p>
          )}

          {error && (
            <p className="cs-error" role="alert">
              {error}
            </p>
          )}

          {/* As easy to withdraw as it was to give — Art 7(3), and the reason
              this sits on the same screen at the same weight. */}
          {recorded ? (
            <button className="cs-btn" onClick={() => save("withdrawn")} disabled={saving}>
              {saving ? "Saving…" : "Change my answer — delete the recording"}
            </button>
          ) : (
            <button className="cs-btn" onClick={() => save("granted")} disabled={saving}>
              {saving ? "Saving…" : "Change my answer — record it after all"}
            </button>
          )}

          <p className="cs-foot">
            Sent on behalf of {view.agencyName}, who is responsible for your data. Tailr processes it
            on their behalf.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="cs-wrap">
      <div className="cs-card">
        <p className="cs-eyebrow">
          {view.agencyName} · interview with {view.company}
        </p>
        <h1 className="cs-title">
          {view.candidateFirstName ? `${view.candidateFirstName}, would ` : "Would "}
          you like this interview recorded?
        </h1>
        <p className="cs-body">
          Your {view.roleTitle} interview is on {when}. Before it happens we need one answer from
          you, and <b>either answer is completely fine</b>.
        </p>

        <p className="cs-body">
          <b>What recording would mean.</b> The audio of the call is transcribed. Your recruiter uses
          the transcript to attach what you actually said to the requirements of the role — in your
          words, quoted, rather than from their memory of the conversation.
        </p>
        <p className="cs-body">
          <b>What it does not mean.</b> Nothing decides anything about you automatically. No software
          scores how you sound, how confident you seem, or how you look. Every judgement here is made
          by a person, and you can ask to see what was recorded against your name.
        </p>
        <p className="cs-body">
          <b>If you would rather not.</b> Say no and the interview happens exactly the same way, at
          the same time, with the same people. Your recruiter writes up their own notes afterwards,
          as they would have done anyway. Declining will not be held against you, and the people
          interviewing you are not told what you chose.
        </p>

        <fieldset className="cs-choice">
          <legend className="cs-legend">Your choice</legend>
          <label className="cs-option">
            <input
              type="radio"
              name="consent"
              value="granted"
              checked={choice === "granted"}
              onChange={() => setChoice("granted")}
            />
            <span>
              <b>Record it.</b> The audio is transcribed so what you said is quoted accurately
              against the role&apos;s requirements.
            </span>
          </label>
          <label className="cs-option">
            <input
              type="radio"
              name="consent"
              value="declined"
              checked={choice === "declined"}
              onChange={() => setChoice("declined")}
            />
            <span>
              <b>Do not record it.</b> Your recruiter writes up notes afterwards instead.
            </span>
          </label>
        </fieldset>

        {error && (
          <p className="cs-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="cs-btn"
          onClick={() => choice && save(choice)}
          disabled={!choice || saving}
        >
          {saving ? "Saving…" : "Save my answer"}
        </button>

        <p className="cs-body cs-small">
          You can change your mind at any point — before the call, during it, or afterwards. If you
          withdraw during or after, the recording is deleted. The audio is deleted as soon as the
          transcript is checked; the transcript is kept for {view.retentionDays} days after the role
          closes and is then deleted with the rest of your data. {view.company} sees the evidence
          your recruiter draws from it, not the recording or the full transcript.
        </p>

        <p className="cs-foot">
          Sent on behalf of {view.agencyName}, who is responsible for your data. Tailr processes it
          on their behalf.
        </p>
      </div>
    </main>
  )
}
