/**
 * The client's role header: the same facts and the same ladder as the
 * recruiter's, projected for the hiring manager.
 *
 * Two rules keep it inside the disclosure line:
 *
 * 1. A contact may read a role's header only if the role is theirs — the
 *    brief they wrote, a submission they received, a round they sit on, or a
 *    window they offered. Any other role id is "not found", not "forbidden",
 *    so the route does not confirm that the id exists.
 * 2. Nothing person-shaped or pool-shaped leaves. The recruiter's counts
 *    (how many candidates, how many screened) are the agency's working, so
 *    in the shortlist phase the chip is coarsened to SHORTLIST IN PROGRESS
 *    and the sentence is "your recruiter is building the shortlist". From
 *    the submission on, the ladder speaks in refs, as the hiring payload
 *    already does.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { agencyAdmin } from "@/lib/agency/db"
import { getRoleFacts } from "@/lib/agency/role-facts"
import { deriveSubState, nextAction } from "@/lib/agency/next-action"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const contactIds = auth.ctx.links.map((l) => l.contactId)
    if (contactIds.length === 0) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    // Is this role theirs? Four ways a contact is tied to a role; any one
    // will do, and all four are read with the service role and then checked
    // against the caller's own contact ids — never the other way round.
    const admin = agencyAdmin()
    const [brief, recipients, rounds, slots] = await Promise.all([
      admin.from("role_briefs").select("agency_id, contact_id").eq("role_id", roleId).in("contact_id", contactIds).limit(1),
      admin
        .from("submission_recipients")
        .select("agency_id, contact_id, submissions!inner(role_id)")
        .eq("submissions.role_id", roleId)
        .in("contact_id", contactIds)
        .limit(1),
      admin.from("interview_rounds").select("agency_id, contact_id").eq("role_id", roleId).in("contact_id", contactIds).limit(1),
      admin.from("availability_slots").select("agency_id, contact_id").eq("role_id", roleId).in("contact_id", contactIds).limit(1),
    ])
    const tie = [brief.data?.[0], recipients.data?.[0], rounds.data?.[0], slots.data?.[0]].find(Boolean) as
      | { agency_id: string; contact_id: string }
      | undefined
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })
    const link = auth.ctx.links.find((l) => l.contactId === tie.contact_id && l.agencyId === tie.agency_id)
    if (!link) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const facts = await getRoleFacts({ agencyId: link.agencyId, userId: auth.ctx.userId, role: "viewer" }, roleId)
    if (!facts) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const sub = deriveSubState(facts)
    const next = nextAction(facts, "client", roleId)
    const inShortlist = facts.phase === "shortlist"
    return NextResponse.json({
      role: { id: facts.roleId, ref: facts.ref, title: facts.title, company: facts.company, recruiterName: facts.ownerName },
      phase: facts.phase,
      subState: inShortlist ? { key: "shortlist-in-progress", chip: "SHORTLIST IN PROGRESS" } : { key: sub.key, chip: sub.chip },
      next: inShortlist ? { ...next, key: "shortlist-in-progress", chip: "SHORTLIST IN PROGRESS", since: null } : next,
      now: facts.now,
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
