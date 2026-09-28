"use client"

/**
 * The role room · Decision — Figma frame 23, band D (22 Sep 2026).
 *
 * A page, not a list: who you took forward, where everyone else landed and
 * at which round, and "That's all my decisions" — once, here. It records
 * nothing on its own and closes nothing: who is hired is the recruiter's
 * placement, and closing the role stays theirs.
 */

import { use } from "react"
import { HandOff, HmFrame, RoomHeader, useRoom } from "@/components/agency/hm-room"
import { DecisionsComplete } from "@/components/agency/hm-shared"
import { outcomeByRef, outcomeSentence, plannedFor, stageHref } from "@/lib/agency/hm-room"

export default function DecisionStage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const room = useRoom(roleId)
  const planned = plannedFor(room.rounds)
  const outcomes = [...outcomeByRef(room.rounds).entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const forward = outcomes.filter(([, o]) => o.decision === "advance" && o.round >= planned).map(([ref]) => ref)
  const pending = outcomes.filter(([, o]) => o.decision === null).length

  const headline =
    forward.length === 1
      ? `You took ${forward[0]} forward.`
      : forward.length > 1
        ? `You took ${forward.length} forward.`
        : pending > 0
          ? "Not decided yet."
          : outcomes.length > 0
            ? "Nobody was taken forward."
            : "No interviews yet."

  return (
    <HmFrame screen={room.screen} crumb="Hiring / Roles / Decision">
      <RoomHeader room={room} roleId={roleId} here={{ key: "decision" }} />

      <section className="agd-band">
        <h2 className="agd-h1 hm-decision-head">{headline}</h2>
        <p className="agd-sub">
          {forward.length > 0
            ? "Your recruiter now handles references, the offer and the handover. Nothing here closes the role."
            : pending > 0
              ? `${pending === 1 ? "One candidate is" : `${pending} candidates are`} still waiting on a round decision.`
              : "When interviews have happened and you have decided, the outcome is summarised here."}
        </p>
        {outcomes.length > 0 && (
          <ul className="hm-quiet-list">
            {outcomes.map(([ref, o]) => (
              <li key={ref}>
                <span className="hm-q-strong">{ref}</span>
                <span data-decision={o.decision ?? undefined}>{outcomeSentence(o, planned)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outcomes.length > 0 && pending === 0 && (
        <section className="agd-band">
          <DecisionsComplete roleId={roleId} />
        </section>
      )}

      <HandOff
        text={
          room.handover.status === "delivered"
            ? "Your recruiter has handed over the record for this hire."
            : "Next, your recruiter collects references and prepares the handover pack. You will get an email when it is ready."
        }
        href={room.handover.status === "delivered" ? stageHref(roleId, { key: "handover" }) : null}
        label="Handover"
        ready={room.handover.status === "delivered"}
      />
    </HmFrame>
  )
}
