"use client"

/**
 * Step 05's second tab: the recommendation.
 *
 * Lives in its own component rather than in the workflow page on purpose —
 * that page is 2,900 lines and 49 pieces of state, and the open structural
 * debt is splitting it, not adding to it. The result state itself lives one
 * level up (`useRecommendation`, owned by the page) because the Matrix tab's
 * "+ The N it recommends" chip counts from the same result.
 *
 * Everything this renders came back from the route already validated:
 * every candidate appears exactly once, every reason carries at least one
 * citation, and a reason the route refused has been replaced by a computed
 * fact line (flagged with `computed`). The component's own job is to keep
 * the framing honest on screen:
 *
 *   · No candidate is ever hidden here, and there is no filter control.
 *   · It carries the decision control (Figma board 26, 24 Sep 2026) — the
 *     SAME `DecisionSlot` as the matrix cards, per person and per group.
 *     The recommendation itself still writes nothing: every add here is the
 *     recruiter's click, routed through the page into the single human-only
 *     decision writer, audit-logged per person and reversible until confirm.
 *   · Groups are rendered in a fixed order and NOT sorted by score inside,
 *     so the third group does not read as a ranking of the least good. That
 *     third group is collapsed by default; its people are one tap away, with
 *     the same Add button as everyone else.
 *   · "Not recommended yet" keeps its adverb everywhere it appears. The
 *     word for the stored value "reject" is "pass", here and on the cards.
 */

import { useState } from "react"
import { Sparkles, RotateCw } from "lucide-react"
import { GROUP_LABELS, GROUP_ORDER, type RecommendationGroup, type RecommendationItem, type RecommendationResult } from "@/lib/agency/recommendation"
import { DecisionSlot } from "@/components/agency/decision-slot"
import { countWord, countWordCap } from "@/components/agency/count-word"

const GROUP_BLURBS: Record<string, string> = {
  recommended:
    "Every must-have evidenced, or answered by something you wrote on the call.",
  second_look:
    "Strong where it counts, with one gap named plainly. A requirement with nothing under it yet — not a judgement about the person.",
  not_yet:
    "Each one carries the specific must-have with nothing under it. All of them stay on the matrix, in the order you left them, one click from the shortlist.",
}

function takeForward(n: number): string {
  if (n === 0) return "Nobody to take forward yet."
  if (n === 1) return "One to take forward, and the reason."
  return `${countWordCap(n)} to take forward, and the reason for each.`
}

export function RecommendationPanel({
  candidateCount,
  callsLogged,
  result,
  busy,
  error,
  onGenerate,
  decisions,
  onDecide,
  onAddMany,
  onOpenCandidate,
}: {
  candidateCount: number
  callsLogged: number
  result: RecommendationResult | null
  busy: boolean
  error: string
  onGenerate: () => void
  /** candidateId → "shortlist" | "hold" | "reject" | null, the page's map. */
  decisions: Record<string, string | null>
  /** One person, one click — the page's single-decision writer (toggling). */
  onDecide: (candidateId: string, decision: "shortlist" | "hold" | "reject") => void
  /** A group's add: the page writes one decision per person, with undo. */
  onAddMany: (candidateIds: string[]) => void
  onOpenCandidate?: (candidateId: string) => void
}) {
  const [showNotYet, setShowNotYet] = useState(false)

  return (
    <div className="ag-reco">
      {!result && (
        <div className="ag-card ag-reco-bar">
          <div className="ag-reco-bar-text">
            <h2 className="ag-reco-h">
              {candidateCount > 12
                ? `${candidateCount} candidates is a lot to read.`
                : "Read your own screening notes back, grouped."}
            </h2>
            <p className="ag-sub" style={{ marginTop: 6 }}>
              Tailr can read the answers you wrote on the screening calls and the scores they moved,
              and come back with a shortlist to argue with. It recommends; you add.
            </p>
          </div>
          <button className="ag-btn ag-btn-primary ag-reco-go" onClick={onGenerate} disabled={busy}>
            {busy ? (
              <>
                <RotateCw size={15} className="ag-spin" aria-hidden />
                Reading {candidateCount} candidates…
              </>
            ) : (
              <>
                <Sparkles size={15} aria-hidden />
                Recommend a shortlist
              </>
            )}
          </button>
        </div>
      )}

      {!result && !error && (
        <div className="ag-reco-reads">
          <div className="ag-reco-read">
            <span className="ag-field-label">What it reads</span>
            <p>
              The answers you typed against each requirement on the call, the five score components
              and must-have coverage, your overrides, and the verbatim CV evidence behind every
              requirement. {callsLogged} of {candidateCount} candidates have a call logged.
            </p>
          </div>
          <div className="ag-reco-read ag-reco-read-line">
            <span className="ag-field-label">What it never reads</span>
            <p>
              Tone, sentiment, confidence, fluency or fit — none of it exists in the product. The
              communication and motivation stars are not sent, and neither are the motivation and
              logistics probes. Where there is nothing written, it says so rather than filling it in.
            </p>
          </div>
          <div className="ag-reco-read">
            <span className="ag-field-label">What comes back</span>
            <p>
              Three groups with every candidate named once, each carrying the reason they are there
              and the quote, call answer or override it came from. Nothing is hidden, nothing is
              filtered, and no decision is written until you add someone yourself.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="ag-reco-error" role="alert">
          <span className="ag-field-label">The recommendation did not run</span>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <>
          <div className="ag-card ag-reco-reading">
            <span className="ag-field-label ag-reco-stamp">
              Recommendation · Generated {new Date(result.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · From {result.items.length} CVs, {callsLogged} call{callsLogged === 1 ? "" : "s"} and {result.items.length} scores
            </span>
            <h2 className="ag-reco-h">{takeForward(result.counts.recommended)}</h2>
            <p className="ag-sub ag-reco-reading-sub">
              A reading of your own notes, not a filter. Everyone is still on the matrix in the order
              you left them. Adding someone here — from any group — is the only thing that writes a
              decision, and it is your click.
            </p>
          </div>

          {GROUP_ORDER.map((group) => {
            const items = result.items.filter((i) => i.group === group)
            if (items.length === 0) return null
            const notIn = items.filter((i) => decisions[i.candidate_id] !== "shortlist")
            const collapsed = group === "not_yet" && !showNotYet
            return (
              <section key={group} className="ag-card ag-reco-group" data-group={group} data-collapsed={collapsed}>
                <div className="ag-reco-group-head">
                  <div className="ag-reco-group-text">
                    <span className="ag-field-label" style={{ marginBottom: 0 }}>
                      {GROUP_LABELS[group]} · {items.length}
                    </span>
                    <p className="ag-reco-blurb">{GROUP_BLURBS[group]}</p>
                  </div>
                  <GroupAction
                    group={group}
                    total={items.length}
                    notIn={notIn}
                    collapsed={collapsed}
                    onToggle={() => setShowNotYet((v) => !v)}
                    onAddMany={onAddMany}
                  />
                </div>
                {!collapsed && items.map((item) => (
                  <div className="ag-reco-person" key={item.candidate_id}>
                    <div className="ag-reco-person-main">
                      <div className="ag-reco-person-head">
                        {onOpenCandidate ? (
                          <button className="ag-reco-name" onClick={() => onOpenCandidate(item.candidate_id)}>
                            {item.full_name}
                          </button>
                        ) : (
                          <span className="ag-reco-name-plain">{item.full_name}</span>
                        )}
                        <span className="ag-meta ag-reco-title">{item.ref}</span>
                        <span className="ag-reco-chip">FIT {item.overall}</span>
                        <span className="ag-reco-chip">
                          MUST {item.must_hit}/{item.must_total}
                        </span>
                      </div>
                      <p className="ag-reco-reason">{item.reason}</p>
                      <div className="ag-reco-traces">
                        {item.traces.map((t) => (
                          <span className="ag-reco-trace" key={t}>
                            {t}
                          </span>
                        ))}
                        {item.computed && (
                          <span className="ag-reco-trace ag-reco-trace-computed">
                            Stated from the record, not written
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ag-reco-decide">
                      <DecisionSlot
                        decision={decisions[item.candidate_id] ?? null}
                        name={item.full_name}
                        quietRow="when-decided"
                        onDecide={(d) => onDecide(item.candidate_id, d)}
                      />
                    </div>
                  </div>
                ))}
              </section>
            )
          })}

          {(result.unasked.length > 0 || result.no_call > 0) && (
            <div className="ag-reco-change">
              <span className="ag-field-label">What would change this recommendation</span>
              {result.unasked.map((r) => (
                <p key={r.ref} className="ag-reco-change-line">
                  <b>
                    {r.ref} · {r.text}
                  </b>{" "}
                  is a {r.weight === "must" ? "must-have" : "requirement"}, and nobody has been asked
                  about it — {r.candidates} of {result.items.length}, no CV evidence and no call
                  answer. It is carried by no one in any group above, because there is nothing to
                  carry.
                </p>
              ))}
              {result.no_call > 0 && (
                <p className="ag-reco-change-line">
                  {result.no_call} candidate{result.no_call === 1 ? " has" : "s have"} no screening
                  call logged at all. This recommendation is reading a thinner record than it looks,
                  and says so rather than filling the space.
                </p>
              )}
            </div>
          )}

          <p className="ag-field-label ag-reco-foot">
            The recommendation proposes; you add. Every add here is the same decision as on the
            matrix — yours, audit-logged, reversible until you confirm. Running it again re-reads
            everything and never touches a decision you have made.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * The group head's button. Nothing when everyone in the group is already in;
 * "Add all N" when nobody is; "Add the other N" when some are. The first
 * group gets a real button, the second a quiet text button, and the third
 * is a disclosure first — its people are shown before they can be added.
 */
function GroupAction({
  group,
  total,
  notIn,
  collapsed,
  onToggle,
  onAddMany,
}: {
  group: RecommendationGroup
  total: number
  notIn: RecommendationItem[]
  collapsed: boolean
  onToggle: () => void
  onAddMany: (ids: string[]) => void
}) {
  const n = notIn.length
  const verb = n === 0 ? null : n === total ? `Add all ${n}` : `Add the other ${n}`
  const add = () => onAddMany(notIn.map((i) => i.candidate_id))

  if (group === "recommended") {
    return verb ? (
      <button type="button" className="ag-btn ag-btn-secondary ag-reco-group-add" onClick={add}>
        {verb} to the shortlist
      </button>
    ) : null
  }
  if (group === "second_look") {
    return verb ? (
      <button type="button" className="ag-reco-text-btn" onClick={add}>
        {verb}
      </button>
    ) : null
  }
  return (
    <span className="ag-reco-group-actions">
      {!collapsed && verb && (
        <button type="button" className="ag-reco-text-btn" onClick={add}>
          {verb}
        </button>
      )}
      <button
        type="button"
        className="ag-reco-text-btn ag-reco-show"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        {collapsed ? `Show the ${countWord(total)} ↓` : "Hide ↑"}
      </button>
    </span>
  )
}
