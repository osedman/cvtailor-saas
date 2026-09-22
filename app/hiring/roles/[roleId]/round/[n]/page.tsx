"use client"

/**
 * The role room · one round — Figma frame 23, band C (22 Sep 2026).
 *
 * WHAT IS LIVE IS OPEN, WHAT IS DONE IS ONE LINE. This page shows only this
 * round's people and only what is owed on them: a write-up once the interview
 * has happened, then a decision. Everyone else in the round is one line
 * saying where they are (booked, choosing a time, decided). Earlier rounds
 * collapse to a line each — history one click away, never gone, never a wall
 * of full cards beside the live ones (which is what the old role page drew).
 */

import { use } from "react"
import Link from "next/link"
import { HandOff, HmFrame, RoomHeader, useRoom } from "@/components/agency/hm-room"
import { DECISION_LABEL, RoundActions, fmtWhen } from "@/components/agency/hm-shared"
import { owedOn, plannedFor, roundEnded, stageHref } from "@/lib/agency/hm-room"
import type { HiringRound } from "@/lib/agency/types"

function standing(r: HiringRound, now: number): string {
  if (r.latest_decision) return DECISION_LABEL[r.latest_decision]
  if (roundEnded(r, now)) return r.has_debrief ? "Written up — decision owed" : "Interview held — write-up owed"
  if (r.scheduled_at) return `Booked · ${fmtWhen(r.scheduled_at)}`
  return "Choosing a time from your windows"
}

export default function RoundStage({ params }: { params: Promise<{ roleId: string; n: string }> }) {
  const { roleId, n: nParam } = use(params)
  const n = Math.max(1, Number.parseInt(nParam, 10) || 1)
  const room = useRoom(roleId)
  const now = room.nowMs
  const planned = plannedFor(room.rounds)

  const inRound = room.rounds.filter((r) => r.round_number === n && r.status !== "cancelled")
  const owed = inRound.filter((r) => owedOn(r, now) !== null)
  const rest = inRound.filter((r) => owedOn(r, now) === null)
  const earlier = Array.from({ length: n - 1 }, (_, i) => i + 1)
    .map((k) => ({ k, rounds: room.rounds.filter((r) => r.round_number === k && r.status !== "cancelled") }))
    .filter((g) => g.rounds.length > 0)

  const allDecided = inRound.length > 0 && inRound.every((r) => r.latest_decision !== null)
  const anyAdvanced = inRound.some((r) => r.latest_decision === "advance")
  const nextStage = anyAdvanced && n < planned ? ({ key: "round", n: n + 1 } as const) : ({ key: "decision" } as const)

  const summary = (rs: HiringRound[]) => {
    const adv = rs.filter((r) => r.latest_decision === "advance").length
    const dec = rs.filter((r) => r.latest_decision === "decline").length
    const hold = rs.filter((r) => r.latest_decision === "hold").length
    const parts = [adv && `${adv} advanced`, dec && `${dec} not advanced`, hold && `${hold} on hold`].filter(Boolean)
    return parts.length ? parts.join(", ") : "no decisions yet"
  }

  return (
    <HmFrame screen={room.screen} crumb={`Hiring / Roles / Round ${n}`}>
      <RoomHeader room={room} roleId={roleId} here={{ key: "round", n }} />

      {inRound.length === 0 ? (
        <section className="agd-band">
          <div className="hm-note-card">
            <p className="hm-note-title">Round {n} has not started.</p>
            <p>
              {n === 1
                ? "Nobody has been invited yet. Choose who to interview on the shortlist, and offer your times."
                : `The candidates you advance after round ${n - 1} are invited here, and book from the times you offer.`}
            </p>
            <Link className="agd-tbtn" href={n === 1 ? stageHref(roleId, { key: "shortlist" }) : `/hiring/roles/${roleId}/interviews`}>
              {n === 1 ? "Go to the shortlist" : "Offer times"} →
            </Link>
          </div>
        </section>
      ) : (
        <>
          {owed.length > 0 && (
            <section className="agd-band" aria-labelledby="hm-owed">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-owed">
                  Round {n} · {owed.length === 1 ? "one needs you" : `${owed.length} need you`}
                </h2>
                <span className="agd-rule" />
              </div>
              <p className="agd-sub hm-stage-lede">
                Write up what you saw, then decide.{" "}
                {n >= planned ? "This is the last planned round — advancing means they are your pick." : `Advancing invites them to round ${n + 1}.`}
              </p>
              <div className="ag-stack" style={{ gap: 12 }}>
                {owed.map((r) => (
                  <div key={r.id} className="ag-stack" style={{ gap: 6 }}>
                    {/* Information, not a gate: the write-up is still offered. */}
                    {r.status === "scheduled" && (
                      <p className="ag-note">
                        Your recruiter has not confirmed this interview took place yet — you can still write it up.
                      </p>
                    )}
                    <RoundActions round={r} onDone={() => void room.reload()} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="agd-band" aria-labelledby="hm-rest">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-rest">
                  {owed.length > 0 ? `Everyone else in round ${n}` : `Round ${n}`}
                </h2>
                <span className="agd-rule" />
              </div>
              <ul className="hm-quiet-list">
                {rest.map((r) => (
                  <li key={r.id}>
                    <Link href={`/hiring/roles/${roleId}/rounds/${encodeURIComponent(r.candidate_ref)}`}>{r.candidate_ref}</Link>
                    <span data-decision={r.latest_decision ?? undefined}>{standing(r, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {earlier.length > 0 && (
        <section className="agd-band" aria-labelledby="hm-earlier">
          <div className="agd-eyebrow-row">
            <h2 className="agd-eyebrow" id="hm-earlier">Earlier rounds</h2>
            <span className="agd-rule" />
          </div>
          <div className="ag-stack" style={{ gap: 8 }}>
            {earlier.map((g) => (
              <details key={g.k} className="hm-history">
                <summary>
                  <span>Round {g.k}</span>
                  <span className="hm-history-sum">{summary(g.rounds)}</span>
                  <span className="hm-history-open">Show</span>
                </summary>
                <ul className="hm-quiet-list">
                  {g.rounds.map((r) => (
                    <li key={r.id}>
                      <Link href={`/hiring/roles/${roleId}/rounds/${encodeURIComponent(r.candidate_ref)}`}>
                        {r.candidate_ref} · open the write-up
                      </Link>
                      <span data-decision={r.latest_decision ?? undefined}>{standing(r, now)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}

      {inRound.length > 0 && (
        <HandOff
          text={
            allDecided
              ? nextStage.key === "round"
                ? `Round ${n} is decided. The people you advanced are invited to round ${n + 1} from the times you offer.`
                : `Round ${n} is decided. Next, confirm where you have landed.`
              : `When everyone in round ${n} is decided, this role moves on${n < planned ? ` to round ${n + 1}` : " to your decision"}.`
          }
          href={stageHref(roleId, nextStage)}
          label={nextStage.key === "round" ? `Round ${n + 1}` : "Decision"}
          ready={allDecided}
        />
      )}
    </HmFrame>
  )
}
