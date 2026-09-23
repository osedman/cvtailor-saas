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

/** Mirrors lib/agency/references.ts RefereeView — the doorway pages do not
 *  import server modules, so the shape is restated rather than shared. */
type ReferenceKind = "character" | "hr"

interface RefereeView {
  agencyName: string
  candidateName: string
  refereeName: string
  relationship: string
  status: string
  kind: ReferenceKind
}

type Screen = "loading" | "invalid" | "ready" | "done"

/**
 * Two forms, because the two references ask different things — Figma frame
 * 24, band H (23 Sep 2026).
 *
 * Until today every referee got the same four open questions, including the
 * HR team of a former employer, who are usually not permitted to answer
 * "what did they do well?" and had to either refuse or overstep.
 *
 * KEYED, NEVER INDEXED. An answer is stored against its key, so changing
 * this set cannot silently re-map an answer somebody already gave. The keys
 * below are therefore append-only in spirit: Q1 was "how did you work with
 * them, and for how long?", which is now the dates, so the character form
 * starts at Q2 rather than renumbering and colliding with old answers.
 */
/**
 * `from` / `to` are what gets STORED against the answer, so they read as full
 * questions in the record. `fromLabel` / `toLabel` are what the referee sees,
 * and they are short on purpose: two labels of unequal length put the two
 * inputs at different heights, which is exactly what the first render did
 * (Figma frame 24 band H, and Ose's screenshot of 23 Sep 2026).
 */
const DATE_QUESTIONS: Record<
  ReferenceKind,
  { legend: string; from: string; to: string; fromLabel: string; toLabel: string; hint: string; still: string }
> = {
  character: {
    legend: "When did you work together?",
    from: "When did you start working together?",
    to: "When did you stop working together?",
    fromLabel: "From",
    toLabel: "To",
    hint: "Month and year is plenty — a rough answer is better than none.",
    still: "We still work together",
  },
  hr: {
    legend: "When were they employed?",
    from: "When did their employment start?",
    to: "When did it end?",
    fromLabel: "From",
    toLabel: "To",
    hint: "Month and year.",
    still: "They still work here",
  },
}

const QUESTIONS_BY_KIND: Record<ReferenceKind, Array<{ key: string; question: string; hint?: string }>> = {
  /** Two questions, not four. Three of the old set overlapped. */
  character: [
    {
      key: "Q2",
      question: "What were they like to work with?",
      hint: "In your own words. Whatever you write is passed on exactly as written — nothing is summarised.",
    },
    { key: "Q4", question: "Would you work with them again, and why?" },
  ],
  /** Facts only. No "what were they like": see the comment above. */
  hr: [
    { key: "H1", question: "What was their job title?" },
    {
      key: "H2",
      question: "Anything factual we should know?",
      hint: "A notice period, or a correction to the dates above. Optional.",
    },
  ],
}

/** The dates are answers like any other, so they need no column of their own
 *  and they arrive verbatim, which is how everything else here is stored. */
const DATE_KEYS = { from: "D1", to: "D2", current: "D3" } as const

export default function ReferencePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [screen, setScreen] = useState<Screen>("loading")
  const [view, setView] = useState<RefereeView | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [declined, setDeclined] = useState(false)
  /** "We still work together" — the honest answer to a missing end date. */
  const [stillThere, setStillThere] = useState(false)
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
                /**
                 * The dates travel as answers, keyed like the rest, so the
                 * recruiter's screen and the handover pack render them with
                 * no new plumbing and the referee's words stay verbatim.
                 */
                answers: [
                  { key: DATE_KEYS.from, question: dates.from, answer: answers[DATE_KEYS.from] ?? "" },
                  {
                    key: DATE_KEYS.to,
                    question: dates.to,
                    answer: stillThere ? "" : answers[DATE_KEYS.to] ?? "",
                  },
                  {
                    key: DATE_KEYS.current,
                    question: kind === "hr" ? "Still employed there?" : "Still working together?",
                    answer: stillThere ? "Yes" : "",
                  },
                  ...questions.map((q) => ({
                    key: q.key,
                    question: q.question,
                    answer: answers[q.key] ?? "",
                  })),
                ].filter((a) => a.answer.trim().length > 0),
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

  /**
   * Which form this link opens. It comes from the reference row, never from
   * the URL or a guess: the recruiter chose it when they added the referee,
   * and the request email already told them which one they were being asked
   * for. An unrecognised value reads as character, the safer of the two.
   */
  const kind: ReferenceKind = view?.kind === "hr" ? "hr" : "character"
  const questions = QUESTIONS_BY_KIND[kind]
  const dates = DATE_QUESTIONS[kind]

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
          <b>You are under no obligation.</b>{" "}There is a &quot;prefer not to&quot; button at the
          bottom, and choosing it tells us to stop asking.
        </p>

        {/* The dates. Free text on purpose: a date picker demands a
            precision most people do not have about a job they left in 2021,
            and "spring 2021" is a more honest answer than a wrong day. */}
        <fieldset className="cs-fieldset cs-q">
          <legend className="cs-q-label">{dates.legend}</legend>
          <p className="cs-hint">{dates.hint}</p>
          <div className="cs-pair">
            <label className="cs-sub" htmlFor={`ref-${DATE_KEYS.from}`}>
              {dates.fromLabel}
              <input
                id={`ref-${DATE_KEYS.from}`}
                className="cs-input"
                placeholder="March 2021"
                autoComplete="off"
                value={answers[DATE_KEYS.from] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [DATE_KEYS.from]: e.target.value.slice(0, 100) }))}
              />
            </label>
            <label className="cs-sub" htmlFor={`ref-${DATE_KEYS.to}`}>
              {dates.toLabel}
              <input
                id={`ref-${DATE_KEYS.to}`}
                className="cs-input"
                placeholder="June 2024"
                autoComplete="off"
                disabled={stillThere}
                value={stillThere ? "" : answers[DATE_KEYS.to] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [DATE_KEYS.to]: e.target.value.slice(0, 100) }))}
              />
            </label>
          </div>
          <label className="cs-check" htmlFor="ref-still">
            <input
              id="ref-still"
              type="checkbox"
              checked={stillThere}
              onChange={(e) => {
                setStillThere(e.target.checked)
                // The end date and the checkbox are the same fact said two
                // ways; letting both stand would send a contradiction.
                setAnswers((a) => ({ ...a, [DATE_KEYS.to]: e.target.checked ? "" : a[DATE_KEYS.to] ?? "" }))
              }}
            />
            <span>{dates.still}</span>
          </label>
        </fieldset>

        {questions.map((q) => (
          <label className="cs-q" key={q.key} htmlFor={`ref-${q.key}`}>
            <span className="cs-q-label">{q.question}</span>
            {q.hint && <span className="cs-hint">{q.hint}</span>}
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

        <div className="cs-actions">
          <button className="cs-btn" onClick={() => submit(false)} disabled={saving} aria-busy={saving}>
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
        </div>

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
