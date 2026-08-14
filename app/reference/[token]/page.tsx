"use client"

/**
 * The referee's page.
 *
 * They never applied for anything. Their details reached us from the candidate,
 * so this screen owes them three things before it asks for anything: who is
 * asking, why they were named, and how to say no without consequence.
 *
 * Declining is a real, equal option rather than a link in the footer — the
 * email says so too. A refusal is recorded as a state, because to a recruiter
 * "declined" and "never replied" mean different things.
 *
 * Their words are stored verbatim. Nothing here summarises or scores.
 *
 * Reuses the consent doorway's stylesheet: same situation, same shape — one
 * person, one decision, arriving cold from an email with no account.
 */

import { use, useCallback, useEffect, useState } from "react"
import "../../consent/consent.css"

interface RefereeView {
  agencyName: string
  candidateName: string
  refereeName: string
  relationship: string
  status: string
}

type Screen = "loading" | "invalid" | "ready" | "done"

/** Four questions, keyed — never indexed, so adding a fifth later cannot
 * silently re-map answers already given. */
const QUESTIONS = [
  { key: "Q1", question: "How did you work with them, and for how long?" },
  { key: "Q2", question: "What did they do well?" },
  { key: "Q3", question: "Is there anything the employer should know?" },
  { key: "Q4", question: "Would you work with them again?" },
]

export default function ReferencePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [screen, setScreen] = useState<Screen>("loading")
  const [view, setView] = useState<RefereeView | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reference/${encodeURIComponent(token)}`)
      if (!res.ok) return setScreen("invalid")
      const body = (await res.json()) as { reference?: RefereeView }
      if (!body.reference) return setScreen("invalid")
      setView(body.reference)
      setScreen("ready")
    } catch {
      setScreen("invalid")
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(decline: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/reference/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          decline
            ? { decline: true }
            : {
                answers: QUESTIONS.map((q) => ({
                  key: q.key,
                  question: q.question,
                  answer: answers[q.key] ?? "",
                })).filter((a) => a.answer.trim().length > 0),
              }
        ),
      })
      if (!res.ok) {
        setError("That did not send. Please try again.")
        return
      }
      setDeclined(decline)
      setScreen("done")
    } catch {
      setError("That did not send. Please try again.")
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
            It may have been used already. If you think you still need to reply, replying to the
            email that brought you here is the quickest way to reach the recruiter.
          </p>
        </div>
      </main>
    )
  }

  if (screen === "done") {
    return (
      <main className="cs-wrap">
        <div className="cs-card">
          <h1 className="cs-title">{declined ? "Understood — thank you" : "Thank you"}</h1>
          <p className="cs-body">
            {declined
              ? `We have recorded that you would rather not give a reference for ${view.candidateName}, and you will not be asked again.`
              : `Your answers have gone to ${view.agencyName} exactly as you wrote them.`}
          </p>
          <p className="cs-foot">
            {view.agencyName} is responsible for the details they hold about you. You can ask to see
            them, correct them or have them deleted by replying to the email that brought you here.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="cs-wrap">
      <div className="cs-card">
        <p className="cs-eyebrow">A reference request · {view.agencyName}</p>
        <h1 className="cs-title">
          {view.candidateName} gave your name
          {view.refereeName ? `, ${view.refereeName}` : ""}
        </h1>
        <p className="cs-body">
          {view.agencyName} is supporting {view.candidateName} with a job application, and they
          named you as someone who has worked with them
          {view.relationship ? ` — ${view.relationship}` : ""}. Your answers go to the recruiter
          exactly as you write them.
        </p>
        <p className="cs-body">
          <b>You are under no obligation.</b> There is a &quot;prefer not to&quot; button at the
          bottom, and choosing it tells us to stop asking.
        </p>

        {QUESTIONS.map((q) => (
          <label className="cs-body" key={q.key} htmlFor={`ref-${q.key}`}>
            <b>{q.question}</b>
            <textarea
              id={`ref-${q.key}`}
              className="cs-textarea"
              rows={3}
              value={answers[q.key] ?? ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [q.key]: e.target.value.slice(0, 4000) }))
              }
            />
          </label>
        ))}

        {error && (
          <p className="cs-error" role="alert">
            {error}
          </p>
        )}

        <button className="cs-btn" onClick={() => submit(false)} disabled={saving}>
          {saving ? "Sending…" : "Send my reference"}
        </button>
        {/* Equal standing, not a footnote. */}
        <button
          className="cs-btn cs-btn-quiet"
          onClick={() => submit(true)}
          disabled={saving}
        >
          I&apos;d prefer not to
        </button>

        <p className="cs-foot">
          <b>What we hold about you.</b> Your name, your email address and your relationship to{" "}
          {view.candidateName} — given to us by them — plus whatever you choose to write.{" "}
          {view.agencyName} is responsible for it and Tailr processes it on their behalf. It is kept
          with this application and deleted on the same schedule. You can ask to see it, correct it
          or have it deleted by replying to the email that brought you here.
        </p>
      </div>
    </main>
  )
}
