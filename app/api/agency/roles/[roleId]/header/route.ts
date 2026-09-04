/**
 * The role header's one request: context, owner, phase, sub-state, the
 * recruiter's next action and the handoff receipt, all from
 * lib/agency/role-facts.ts and the ladder in lib/agency/next-action.ts.
 * Every role screen renders the header from this, so the six screens
 * cannot disagree about where the role is.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { getRoleFacts } from "@/lib/agency/role-facts"
import { deriveSubState, handoffFor, nextAction } from "@/lib/agency/next-action"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const facts = await getRoleFacts(auth.ctx, roleId)
    if (!facts) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const sub = deriveSubState(facts)
    return NextResponse.json({
      role: { id: facts.roleId, ref: facts.ref, title: facts.title, company: facts.company, ownerId: facts.ownerId, ownerName: facts.ownerName },
      client: facts.clientName,
      phase: facts.phase,
      subState: { key: sub.key, chip: sub.chip },
      next: nextAction(facts, "recruiter", roleId),
      handoff: handoffFor(facts, "recruiter", roleId),
      callerRole: auth.ctx.role,
      now: facts.now,
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
