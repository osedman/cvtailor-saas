"use client"

/**
 * Step 05's second tab: "Recommend a shortlist".
 *
 * Lives in its own component rather than in the workflow page on purpose —
 * that page is 2,900 lines and 49 pieces of state, and the open structural
 * debt is splitting it, not adding to it.
 *
 * Everything this renders came back from the route already validated:
 * every candidate appears exactly once, every reason carries at least one
 * citation, and a reason the route refused has been replaced by a computed
 * fact line (flagged with `computed`). The component's own job is to keep
 * the framing honest on screen:
 *
 *   · No candidate is ever hidden here, and there is no filter control.
 *   · No decision control. Shortlist / hold / reject stay on the matrix,
 *     where they always were — this tab cannot write one.
 *   · Groups are rendered in a fixed order and NOT sorted by score inside,
 *     so the third group does not read as a ranking of the least good.
 *   · "Not recommended yet" keeps its adverb everywhere it appears.
 */

import { useCallback, useState } from "react"
import { Sparkles, RotateCw } from "lucide-react"
import { GROUP_LABELS, GROUP_ORDER, type RecommendationResult } from "@/lib/agency/recommendation"
import { errorMessage } from "@/lib/error-message"

const GROUP_BLURBS: Record<string, string> = {
  recommended:
    "Every must-have evidenced, or answered by something you wrote on the call.",
  second_look:
    "Strong where it counts, with one gap named plainly. A requirement with nothing under it yet — not a judgement about the person.",
  not_yet:
    "Each one carries the specific must-have with nothing under it. Every one of these is still on the matrix, in the order you left them, one click from being shortlisted.",
}

export function RecommendationPanel({
  roleId,
  candidateCount,
  callsLogged,
  onOpenCandidate,
}: {
  roleId: string
  candidateCount: number
  callsLogged: number
  onOpenCandidate?: (candidateId: string) => void
}) {
  const [result, setResult] = useState<RecommendationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const generate = useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/recommendation`, { method: "POST" })
      const body = await res.json()
      // A failed load must never read as an empty one.
      if (!res.ok) throw new Error(body?.error || `The recommendation failed (${res.status})`)
      setResult(body as RecommendationResult)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [roleId])

  return (
    <div className="ag-reco">
      <div className="ag-card ag-reco-bar">
        <div className="ag-reco-bar-text">
          <h2 className="ag-reco-h">
            {candidateCount > 12
              ? `${candidateCount} candidates is a lot to read.`
              : "Read your own screening notes back, grouped."}
          </h2>
          <p className="ag-sub" style={{ marginTop: 6 }}>
            Tailr can read the answers you wrote on the screening calls and the scores they moved,
            and come back with a shortlist to argue with. It recommends; you decide.
          </p>
        </div>
        <button className="ag-btn ag-btn-primary ag-reco-go" onClick={generate} disabled={busy}>
          {busy ? (
            <>
              <RotateCw size={15} className="ag-spin" aria-hidden />
              Reading {candidateCount} candidates…
            </>
          ) : (
            <>
              <Sparkles size={15} aria-hidden />
              {result ? "Run it again" : "Recommend a shortlist"}
            </>
          )}
        </button>
      </div>

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
              filtered, and no decision is written until you press shortlist yourself.
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
          <p className="ag-meta ag-reco-stamp">
            Generated {new Date(result.generated_at).toLocaleString("en-GB")} · {result.model} ·
            read {result.items.length} candidates and every screening answer on this role. A reading
            of your own notes, not a filter.
          </p>

          {GROUP_ORDER.map((group) => {
            const items = result.items.filter((i) => i.group === group)
            if (items.length === 0) return null
            return (
              <section key={group} className="ag-card ag-reco-group" data-group={group}>
                <div className="ag-reco-group-head">
                  <span className="ag-field-label" style={{ marginBottom: 0 }}>
                    {GROUP_LABELS[group]} · {items.length}
                  </span>
                </div>
                <p className="ag-reco-blurb">{GROUP_BLURBS[group]}</p>
                {items.map((item) => (
                  <div className="ag-reco-person" key={item.candidate_id}>
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

          <p className="ag-meta ag-reco-foot">
            Nothing on this tab writes a decision. Shortlist, hold and reject live on the matrix,
            where they always have — running this again re-reads everything and never overwrites a
            call you have already made.
          </p>
        </>
      )}
    </div>
  )
}
