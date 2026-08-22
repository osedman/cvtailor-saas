/**
 * Every candidate the agency holds, across every role.
 *
 * The sidebar has counted candidates since the first build and the count has
 * never been a route: you reach a person only by knowing which role they are
 * on. So a candidate rejected from one role is invisible when a second role
 * would suit them, and "do we already know this person?" cannot be answered
 * without opening roles one at a time. Found in Ose's walk-through, 22 Aug.
 *
 * Agency-scoped through requireAgencyContext like everything else. Reads
 * only — decisions are made on the role, and this screen never becomes a
 * second place to make them.
 *
 * WHAT IS DELIBERATELY ABSENT: right to work, sponsorship and represent
 * answers. Those belong on the person, not in a list somebody scans — a
 * compliance column in a table is one sort away from being a filter on
 * people, which is the thing every guardrail in this schema exists to stop.
 */

import { NextResponse } from "next/server"
import { AgencyAccessError, agencyAdmin, requireAgencyContext } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const admin = agencyAdmin()
    const { data: candidates, error } = await admin
      .from("candidates")
      .select("id, ref, full_name, current_title, role_id, source, ingested_at, redacted")
      .eq("agency_id", auth.ctx.agencyId)
      .order("ingested_at", { ascending: false })
      .limit(500)
    if (error) throw error

    const rows = candidates ?? []
    if (rows.length === 0) return NextResponse.json({ candidates: [] })

    const ids = rows.map((c) => c.id as string)
    const roleIds = [...new Set(rows.map((c) => c.role_id as string).filter(Boolean))]

    const [{ data: roles }, { data: reviews }, { data: scores }] = await Promise.all([
      admin.from("job_roles").select("id, ref, title, company, status").in("id", roleIds),
      admin.from("recruiter_reviews").select("candidate_id, decision").in("candidate_id", ids),
      admin.from("score_breakdowns").select("candidate_id, overall").in("candidate_id", ids),
    ])

    const roleById = new Map((roles ?? []).map((r) => [r.id as string, r]))
    const decisionBy = new Map((reviews ?? []).map((r) => [r.candidate_id as string, r.decision]))
    // A candidate can carry more than one breakdown across rescores; the
    // newest wins, and the query returns them in insertion order.
    const scoreBy = new Map<string, number>()
    for (const s of scores ?? []) scoreBy.set(s.candidate_id as string, Math.round(s.overall as number))

    return NextResponse.json({
      candidates: rows.map((c) => {
        const role = roleById.get(c.role_id as string)
        return {
          id: c.id,
          ref: c.ref,
          // A redacted candidate keeps its row: the erasure is visible as a
          // fact rather than as an absence somebody has to notice.
          fullName: c.redacted ? "Erased at their request" : c.full_name,
          currentTitle: c.redacted ? "" : c.current_title,
          redacted: !!c.redacted,
          roleId: c.role_id,
          roleRef: (role?.ref as string) ?? "",
          roleTitle: (role?.title as string) ?? "",
          roleCompany: (role?.company as string) ?? "",
          roleClosed: role?.status === "closed",
          decision: decisionBy.get(c.id as string) ?? null,
          score: scoreBy.get(c.id as string) ?? null,
          source: c.source,
          addedAt: c.ingested_at,
        }
      }),
    })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
