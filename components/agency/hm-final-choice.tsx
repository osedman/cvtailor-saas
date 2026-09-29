"use client"

/**
 * The final choice — Figma board 31, bands B and C (approved 28 Sep 2026).
 *
 * Everyone taken forward, side by side on the same lines, and one choice in
 * the hiring manager's own words. The reason is required because it is the
 * justification: it goes to the recruiter with the choice and into the
 * handover pack. See lib/agency/final-choice.ts for the lines this keeps —
 * a preference and never a hire, and choosing one person turns nobody down.
 */

import { useCallback, useEffect, useState } from "react"
import { displayName, withheldSentence, type SubmittedCases } from "@/components/agency/hm-case"
import { CandidateDetail } from "@/components/agency/hm-candidate"
import { DECISION_LABEL } from "@/components/agency/hm-shared"
import { HINTS, Hint } from "@/components/agency/hint"
import { RoundRequestForm, RoundRequestSent, useRoundRequest } from "@/components/agency/hm-round-request"
import type { HiringRound } from "@/lib/agency/types"

interface Choice {
  action: "chosen" | "neither"
  candidateRef: string | null
  reason: string
  at: string
}

type ChoiceState = { state: "loading" } | { state: "error" } | { state: "ready"; choice: Choice | null }

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

function trail(rounds: HiringRound[], ref: string): string[] {
  return rounds
    .filter((r) => r.candidate_ref === ref && r.status !== "cancelled")
    .sort((a, b) => a.round_number - b.round_number)
    .map(
      (r) =>
        `Round ${r.round_number} · ${r.latest_decision ? DECISION_LABEL[r.latest_decision] : "Not decided"}${
          r.latest_decision_at ? ` · ${new Date(r.latest_decision_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""
        }`
    )
}

export function FinalChoice({
  roleId,
  finalists,
  rounds,
  cases,
  onSent,
  agencyName = "",
}: {
  roleId: string
  finalists: string[]
  rounds: HiringRound[]
  cases: SubmittedCases
  /** Told whether a live choice exists, so the page can show what comes after it. */
  onSent?: (sent: boolean) => void
  /** Names the recruiter in the "ask for another round" form. */
  agencyName?: string
}) {
  const [live, setLive] = useState<ChoiceState>({ state: "loading" })
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<string | "neither" | null>(null)
  const [reason, setReason] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const rr = useRoundRequest(roleId)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/hiring/roles/${roleId}/final-choice`, { cache: "no-store" })
      if (!r.ok) return setLive({ state: "error" })
      const b = (await r.json()) as { choice: Choice | null }
      setLive({ state: "ready", choice: b.choice })
    } catch {
      setLive({ state: "error" })
    }
  }, [roleId])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    onSent?.(live.state === "ready" && live.choice !== null)
  }, [live, onSent])

  const entry = (ref: string) => (cases.state === "ready" ? cases.byRef.get(ref) : undefined)
  const nameOf = (ref: string) => displayName(entry(ref), ref)
  const first = (ref: string) => nameOf(ref).split(" ")[0]

  async function send(action: "chosen" | "neither" | "withdrawn") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/hiring/roles/${roleId}/final-choice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, candidateRef: action === "chosen" ? picked : null, reason }),
      })
      const body = (await res.json().catch(() => ({}))) as { choice?: Choice | null; error?: string }
      if (!res.ok) return setError(body.error || "That did not save. Try again.")
      setLive({ state: "ready", choice: body.choice ?? null })
      setEditing(false)
      setPicked(null)
      setReason("")
    } catch {
      setError("That did not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (live.state === "loading") return <p className="ag-quiet" role="status">Loading your choice…</p>
  if (live.state === "error") {
    return (
      <p className="ag-banner" role="alert">
        We could not load your choice. Nothing has changed —{" "}
        <button className="hm-linkbtn" onClick={() => void load()}>
          try again
        </button>
        .
      </p>
    )
  }

  const choice = live.choice
  // ── Band C · the choice as sent ──────────────────────────────────────────
  if (choice && !editing) {
    const others = finalists.filter((r) => r !== choice.candidateRef)
    return (
      <div className="hm-final-sent">
        <h2 className="agd-h1 hm-decision-head">
          {choice.action === "chosen" && choice.candidateRef ? `You chose ${nameOf(choice.candidateRef)}.` : "You chose neither."}
        </h2>
        <figure className="hm-final-reason">
          <figcaption className="agd-eyebrow">Your reason · sent {fmtDate(choice.at)}</figcaption>
          <blockquote>{choice.reason}</blockquote>
        </figure>
        <p className="agd-sub">
          {choice.action === "chosen"
            ? `Your recruiter now takes references and the offer.${
                others.length > 0
                  ? ` ${others.map(nameOf).join(" and ")} ${others.length === 1 ? "stays" : "stay"} taken forward until they speak to ${others.length === 1 ? "them" : "each of them"}.`
                  : ""
              }`
            : "Your recruiter will talk to you about what happens next. Nobody has been told anything."}
        </p>
        <div className="hm-final-row">
          <button
            className="agd-tbtn"
            onClick={() => {
              setEditing(true)
              setPicked(choice.action === "chosen" ? choice.candidateRef : "neither")
              setReason(choice.reason)
            }}
          >
            Change my choice
          </button>
          <button className="hm-linkbtn" disabled={busy} onClick={() => void send("withdrawn")}>
            Take it back — I have not decided
          </button>
        </div>
        {error && <p className="ag-banner" role="alert">{error}</p>}
      </div>
    )
  }

  // ── Board 33 · a request for another round is open ──────────────────────
  if (rr.live.state === "ready" && rr.live.request && !editing) {
    return (
      <RoundRequestSent
        roleId={roleId}
        request={rr.live.request}
        nameOf={nameOf}
        onChange={(r) => rr.setLive({ state: "ready", request: r })}
      />
    )
  }

  // ── Band B · choose ──────────────────────────────────────────────────────
  const withheld = cases.state === "ready" ? withheldSentence(cases.disclosure) : null
  const whyLabel =
    picked === "neither"
      ? "Why neither · in your words · goes to your recruiter"
      : picked
        ? `Why ${first(picked)} · in your words · goes to your recruiter with your choice`
        : null

  return (
    <div className="hm-final">
      <h2 className="agd-h1 hm-decision-head">
        {finalists.length === 1
          ? `You took ${nameOf(finalists[0])} forward. Are they your choice?`
          : `You took ${finalists.length} forward. Who would you like to offer?`}
      </h2>
      <p className="agd-sub">
        Choosing one does not turn anyone else down. Your recruiter speaks to everyone, and nothing is final until
        they confirm the hire with you.
      </p>
      {withheld && <p className="ag-quiet">{withheld}</p>}

      <div className="hm-final-grid" role="radiogroup" aria-label="Your final choice">
        {finalists.map((ref) => {
          const e = entry(ref)
          const on = picked === ref
          return (
            <article key={ref} className="hm-finalist" data-picked={on}>
              <div className="hm-case-who">
                <div className="ag-grow" style={{ minWidth: 0 }}>
                  <p className="hm-case-name">{nameOf(ref)}</p>
                  <p className="hm-case-title">
                    {[e?.currentTitle, ref].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              {e && (e.overall !== null || e.mustHaveTotal !== null) && (
                <div className="hm-final-row">
                  {e.overall !== null && (
                    <Hint text={HINTS.fit} tone="fit">
                      Fit {Math.round(e.overall)}
                    </Hint>
                  )}
                  {e.mustHaveHit !== null && e.mustHaveTotal !== null && (
                    <Hint text={HINTS.mustHaves}>
                      {e.mustHaveHit} of {e.mustHaveTotal} must-haves
                    </Hint>
                  )}
                </div>
              )}
              <section>
                <h4 className="agd-eyebrow">Your rounds</h4>
                <ul className="hm-final-trail">
                  {trail(rounds, ref).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
              {open === ref && e && cases.state === "ready" ? (
                <CandidateDetail roleId={roleId} entry={e} disclosure={cases.disclosure} />
              ) : (
                <>
                  {e?.strengths && e.strengths.length > 0 && (
                    <section className="hm-case-ev">
                      <h4 className="agd-eyebrow">Strongest evidence</h4>
                      <ul>
                        {e.strengths.slice(0, 2).map((s, i) => (
                          <li key={`${s.requirement}-${i}`}>
                            <b>{s.requirement}</b>
                            <q>{s.quote}</q>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {e?.gaps && e.gaps.length > 0 && (
                    <section className="hm-case-side">
                      <h4 className="agd-eyebrow">Known gaps</h4>
                      <p>{e.gaps.map((g) => g.requirement).join(" · ")} — not in their CV.</p>
                    </section>
                  )}
                  {!e && cases.state !== "loading" && (
                    <p className="ag-quiet">Your recruiter has not sent you {ref}&apos;s evidence in a submission.</p>
                  )}
                </>
              )}
              <div className="hm-final-row">
                <button
                  className={on ? "hm-final-pick" : "agd-tbtn primary"}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(ref)}
                >
                  {on ? "✓ Your choice" : `Choose ${first(ref)}`}
                </button>
                {e && (
                  <button className="hm-linkbtn" onClick={() => setOpen(open === ref ? null : ref)} aria-expanded={open === ref}>
                    {open === ref ? "Show less" : "Read CV · all evidence"}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {whyLabel && (
        <div className="hm-final-why">
          <label className="hm-field" htmlFor="hm-final-reason">
            <span className="agd-eyebrow">{whyLabel}</span>
            <textarea
              id="hm-final-reason"
              className="ag-textarea"
              rows={3}
              value={reason}
              onChange={(ev) => setReason(ev.target.value.slice(0, 2000))}
              placeholder={
                picked === "neither"
                  ? "What was missing? It helps your recruiter decide what to do next."
                  : "What decided it for you? Point at what you saw and what they said."
              }
            />
          </label>
          <div className="hm-final-row">
            <button
              className="agd-tbtn accent"
              disabled={busy || !reason.trim()}
              onClick={() => void send(picked === "neither" ? "neither" : "chosen")}
            >
              {busy ? "Sending…" : picked === "neither" ? "Tell my recruiter: neither" : "Send my choice to my recruiter"}
            </button>
            <span className="ag-quiet">
              {reason.trim() ? "You can change it until they confirm the hire." : "Your reason is required — it is the record of why."}
            </span>
            {editing && (
              <button className="hm-linkbtn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="ag-banner" role="alert">{error}</p>}

      {asking ? (
        <RoundRequestForm
          roleId={roleId}
          finalists={finalists}
          nameOf={nameOf}
          agencyName={agencyName}
          onSent={(r) => {
            setAsking(false)
            rr.setLive({ state: "ready", request: r })
          }}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <p className="hm-final-alt">
          <span>Not ready to choose?</span>{" "}
          <button className="hm-linkbtn" onClick={() => setAsking(true)}>
            Ask for another round
          </button>
          {picked !== "neither" && (
            <>
              {" · "}
              <button className="hm-linkbtn" onClick={() => setPicked("neither")}>
                Neither of them
              </button>
            </>
          )}
        </p>
      )}
    </div>
  )
}
