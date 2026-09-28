"use client"

/**
 * The role room · Handover — Figma frame 23, band F (22 Sep 2026).
 *
 * The sealed pack the recruiter delivered, read-only and printable, for the
 * employer contact it was delivered TO. Before delivery this says what is
 * happening and that an email will come. Until 22 Sep "delivered" reached
 * nobody: the button recorded it, and the client had no way to see it.
 *
 * Known gaps stay first-class — what was never evidenced is stated, not
 * omitted, exactly as the recruiter's own copy of the pack keeps it.
 */

import { use } from "react"
import { HmFrame, RoomHeader, useRoom } from "@/components/agency/hm-room"
import type { HandoverSnapshot } from "@/lib/agency/handover"

const DECISION_WORD: Record<string, string> = { advance: "advanced", hold: "held", decline: "not advanced" }
const STRENGTH_WORD: Record<string, string> = { strong: "strong evidence", transferable: "transferable", partial: "partial" }

export default function HandoverStage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const room = useRoom(roleId)
  const pack = room.handover.status === "delivered" ? (room.handover.snapshot as HandoverSnapshot) : null
  const deliveredOn = room.handover.deliveredAt
    ? new Date(room.handover.deliveredAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : ""

  return (
    <HmFrame screen={room.screen} crumb="Hiring / Roles / Handover">
      <RoomHeader room={room} roleId={roleId} here={{ key: "handover" }} />

      {room.handover.status === "loading" && <p className="ag-quiet" aria-live="polite">Loading…</p>}
      {room.handover.status === "error" && (
        <p className="ag-banner" role="alert">We could not load the handover. Reload the page.</p>
      )}
      {room.handover.status === "not_yet" && (
        <section className="agd-band">
          <div className="hm-note-card">
            <p className="hm-note-title">Your recruiter is preparing the handover.</p>
            <p>
              They are collecting references and putting together the record for the person you took forward.
              You will get an email when it is ready — nothing is needed from you.
            </p>
          </div>
        </section>
      )}

      {pack && (
        <article className="hm-pack" aria-labelledby="hm-pack-title">
          <p className="hm-pack-eyebrow">
            Handover record · {pack.role.ref} · {pack.candidate.ref} · delivered {deliveredOn}
          </p>
          <h2 className="agd-h1" id="hm-pack-title">{pack.candidate.name}</h2>
          <p className="agd-sub">
            {pack.role.title}
            {pack.role.company ? ` · ${pack.role.company}` : ""} · prepared by {pack.agency}. From here you hold this
            record as the employer.
          </p>
          <div className="hm-pack-actions ag-print-hide">
            <button className="agd-tbtn primary" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </div>

          {pack.gaps.length > 0 && (
            <section className="hm-pack-section">
              <h3>Known gaps, stated plainly</h3>
              <ul>{pack.gaps.map((g, i) => <li key={i}>{g.requirement}{g.weight ? ` (${g.weight})` : ""} — never evidenced</li>)}</ul>
            </section>
          )}

          <section className="hm-pack-section">
            <h3>Evidence</h3>
            {pack.evidence.length === 0 ? (
              <p>No requirement was evidenced.</p>
            ) : (
              <ul>
                {pack.evidence.map((e, i) => (
                  <li key={i}>
                    <b>{e.requirement}</b> · {STRENGTH_WORD[e.strength] ?? e.strength}
                    {e.quote ? <> — “{e.quote}”</> : null}
                    {e.source ? <span className="hm-pack-src"> ({e.source})</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="hm-pack-section">
            <h3>Interviews</h3>
            {pack.rounds.length === 0 ? (
              <p>No interview rounds on record.</p>
            ) : (
              <ul>
                {pack.rounds.map((r) => (
                  <li key={r.number}>
                    Round {r.number}
                    {r.when ? ` · ${new Date(r.when).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} ·{" "}
                    {r.decision ? DECISION_WORD[r.decision] ?? r.decision : "no decision recorded"}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="hm-pack-section">
            <h3>References</h3>
            {pack.references.length === 0 ? (
              <p>No references on record.</p>
            ) : (
              pack.references.map((ref, i) => (
                <div key={i} className="hm-pack-ref">
                  <p>
                    <b>{ref.referee}</b>
                    {ref.relationship ? ` · ${ref.relationship}` : ""} · {ref.status}
                  </p>
                  {ref.answers.map((a, j) => (
                    <p key={j}>
                      <span className="hm-pack-q">{a.question}</span> {a.answer}
                    </p>
                  ))}
                </div>
              ))
            )}
          </section>

          {pack.compliance && (
            <section className="hm-pack-section">
              <h3>Right to work and logistics</h3>
              <ul>
                <li>{pack.compliance.evidence}</li>
                {pack.compliance.sponsorship && <li>{pack.compliance.sponsorship}</li>}
                {pack.compliance.noticePeriod && <li>Notice period: {pack.compliance.noticePeriod}</li>}
              </ul>
              {pack.compliance.employerNotice && <p className="hm-pack-src">{pack.compliance.employerNotice}</p>}
            </section>
          )}

          <p className="hm-pack-footer">{pack.footer}</p>
        </article>
      )}
    </HmFrame>
  )
}
