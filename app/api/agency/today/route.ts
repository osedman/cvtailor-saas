/**
 * Today: one next action per open role, from the same ladder as the role
 * header, so the queue at the top of /agencies and the chip on a role screen
 * can never disagree. The page groups rows by who is blocking (you, a
 * client, a candidate, nobody) — that grouping is the prototype's one real
 * idea about a dashboard, and it needs nothing stored.
 *
 * Cost: the facts are assembled per role. Fine at agency scale (tens of
 * roles); if it ever is not, the fix is a batched assembler, not a cache.
 */

import { NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { getRoleFacts } from "@/lib/agency/role-facts"
import { deriveSubState, nextAction } from "@/lib/agency/next-action"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 60

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const { data: roles, error } = await auth.db
      .from("job_roles")
      .select("id, status, created_at")
      .eq("agency_id", auth.ctx.agencyId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(60)
    if (error) throw error

    const now = new Date().toISOString()
    const rows = (
      await Promise.all(
        (roles ?? []).map(async (r) => {
          const facts = await getRoleFacts(auth.ctx, r.id as string, now)
          if (!facts) return null
          const sub = deriveSubState(facts)
          return {
            role: { id: facts.roleId, ref: facts.ref, title: facts.title, company: facts.company, ownerId: facts.ownerId, ownerName: facts.ownerName },
            phase: facts.phase,
            subState: { key: sub.key, chip: sub.chip },
            next: nextAction(facts, "recruiter", facts.roleId),
          }
        })
      )
    ).filter((r): r is NonNullable<typeof r> => r !== null)

    return NextResponse.json({ roles: rows, now })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
