"use client"

/**
 * The role-local rail: the three places a role has, on every screen that
 * belongs to one.
 *
 * Sits UNDER the global AgencyNav in the sidebar, so the two levels stay
 * apart: the global list answers "where do I work", this one answers "where
 * is this role". Interviews, close-out, the dossier and the candidate file
 * each hand-rolled a version of this with different items in a different
 * order, and every one of them linked the role bare — which, past
 * submission, forwards straight back to the screen you clicked from.
 *
 * "Shortlist flow" always carries ?flow=shortlist (workflowHref). It shows a
 * tick once the role is past that phase: the flow is finished, not gone.
 */

import { useRouter } from "next/navigation"
import { phaseHref, workflowHref, type PhaseKey } from "@/lib/agency/phases"

export type RoleRailKey = "workflow" | "interviews" | "close-out"

export function RoleRail({
  roleId,
  phase,
  current,
  leaf,
}: {
  roleId: string
  /** null while the facts load; the tick on "Shortlist flow" waits for it. */
  phase: PhaseKey | null
  /** Which of the three this screen is, or null for a screen hanging off one. */
  current: RoleRailKey | null
  /** A current item that is neither of the three, e.g. "Dossier". */
  leaf?: string
}) {
  const router = useRouter()
  const shortlistDone = phase !== null && phase !== "shortlist"

  const item = (key: RoleRailKey, label: string, href: string, done = false) => {
    const on = current === key
    return (
      <button
        key={key}
        className={`ag-step${on ? " on" : ""}`}
        aria-current={on ? "page" : undefined}
        onClick={on ? undefined : () => router.push(href)}
      >
        {done && <span className="ag-step-num done">✓</span>}
        {label}
      </button>
    )
  }

  return (
    <div>
      <div className="ag-rail-label">This role</div>
      {item("workflow", "Shortlist flow", workflowHref(roleId), shortlistDone)}
      {item("interviews", "Interviews", phaseHref("interviews", roleId))}
      {item("close-out", "Close-out", phaseHref("handover", roleId))}
      {leaf && (
        <button className="ag-step on" aria-current="page">
          {leaf}
        </button>
      )}
    </div>
  )
}
