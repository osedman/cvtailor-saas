"use client"

/**
 * Roles — where is each hire? Figma frame 23, band E (22 Sep 2026).
 *
 * One row per role: its stage on the same bar the room uses, and one line of
 * what is next — in bold when it is yours. The row opens the role's room at
 * the stage it is at. Finished roles stay listed under "Finished"; a role
 * never disappears because it is quiet.
 */

import { useMemo } from "react"
import Link from "next/link"
import { HmFrame, useHiringData } from "@/components/agency/hm-room"
import { EmptyBand } from "@/components/agency/hm-shared"
import { buildTodo, currentStage, roomStages, stageHref, stageIndex, stageLabel } from "@/lib/agency/hm-room"
import { toSummary } from "@/components/agency/hm-room"

export default function RolesPage() {
  const { screen, roles, rounds, nowMs: now } = useHiringData()
  const todo = useMemo(() => buildTodo(roles.map(toSummary), rounds, now), [roles, rounds, now])

  const rows = roles.map((r) => {
    const mine = rounds.filter((x) => x.role_id === r.role.id)
    const stages = roomStages(mine)
    // The handover stage needs the pack; a list of roles does not fetch one
    // per row. A role the ladder calls handed over reads as Decision here and
    // Handover inside its room — never further along than the facts say.
    const current = currentStage(mine, r.subState.key, false)
    const owed = todo.filter((t) => t.role.id === r.role.id)
    return { r, stages, current, owed, finished: r.next.mode === "done" }
  })
  const open = rows.filter((x) => !x.finished)
  const finished = rows.filter((x) => x.finished)

  const RoleRow = ({ x }: { x: (typeof rows)[number] }) => {
    const ci = stageIndex(x.stages, x.current)
    return (
      <li className="hm-role-row">
        <Link className="hm-role-link" href={stageHref(x.r.role.id, x.current)}>
          <span className="hm-role-title">{x.r.role.title}</span>
          <span className="hm-role-meta">
            {x.r.role.ref}
            {x.r.role.recruiterName ? ` · with ${x.r.role.recruiterName}` : ""} · stage: {stageLabel(x.current)}
          </span>
          <span className="hm-role-progress" aria-hidden="true">
            {x.stages.map((s, i) => (
              <span key={i} data-state={i < ci ? "done" : i === ci ? "current" : "next"} />
            ))}
          </span>
          <span className="hm-role-next" data-yours={x.owed.length > 0 || x.r.next.mode === "act" || undefined}>
            {x.owed.length > 0
              ? x.owed.map((t) => `${t.verb} · ${t.who}`).join(" — ")
              : x.r.next.mode === "act"
                ? x.r.next.title
                : `${x.r.next.title}${x.r.next.mode === "wait" ? ` · ${x.r.next.waitingOn.label}` : ""}`}
          </span>
        </Link>
      </li>
    )
  }

  return (
    <HmFrame screen={screen} crumb={<><Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> / Roles</>}>
      <section className="agd-hero">
        <h1 className="agd-h1">Your roles</h1>
        <p className="agd-sub">
          Every role your recruiter has opened with you, and the stage each is at. Open one to walk it
          from shortlist to handover.
        </p>
      </section>

      {rows.length === 0 ? (
        <EmptyBand
          title="No roles yet."
          body="When your recruiter opens a role with you named on it, it appears here."
        />
      ) : (
        <>
          <section className="agd-band" aria-labelledby="hm-open">
            <div className="agd-eyebrow-row">
              <h2 className="agd-eyebrow" id="hm-open">In progress</h2>
              <span className="agd-rule" />
            </div>
            {open.length > 0 ? (
              <ul className="hm-role-list">{open.map((x) => <RoleRow key={x.r.role.id} x={x} />)}</ul>
            ) : (
              <p className="ag-note">Nothing in progress — every role below is finished.</p>
            )}
          </section>
          {finished.length > 0 && (
            <section className="agd-band" aria-labelledby="hm-finished">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-finished">Finished</h2>
                <span className="agd-rule" />
              </div>
              <ul className="hm-role-list">{finished.map((x) => <RoleRow key={x.r.role.id} x={x} />)}</ul>
            </section>
          )}
        </>
      )}
    </HmFrame>
  )
}
