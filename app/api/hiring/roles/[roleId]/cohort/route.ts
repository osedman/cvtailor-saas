/**
 * Invite the interview cohort: the candidates the client chose, each given a
 * link to pick their own time. See lib/agency/cohort.ts for why the round
 * carries no time and why the recruiter is not in this path.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { listClientRoles } from "@/lib/agency/client-header"
import { getCohortBoard, inviteCohort, remindCohortMember } from "@/lib/agency/cohort"
import { getWaveState, planRelease, releaseWave } from "@/lib/agency/waves"
import { getClientShortlist } from "@/lib/agency/client-shortlist"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 60

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    // Releasing the next wave rather than naming people: the planner picks
    // from the reserve, bounded by capacity.
    if (body?.release === true) {
      const outcome = await releaseWave(tie.agencyId, roleId, tie.contactId, auth.ctx.userId)
      return NextResponse.json(outcome, { status: 201 })
    }

    const refs = Array.isArray(body?.candidateRefs)
      ? (body.candidateRefs as unknown[]).filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 20))
      : []
    if (refs.length === 0) return NextResponse.json({ error: "candidateRefs are required" }, { status: 400 })

    // Only people actually put in front of this client. inviteCohort checks
    // the ref is on the ROLE, which includes everyone the recruiter screened
    // out — a hand-built POST could email them booking links naming the
    // client (21 Sep 2026).
    const shortlist = await getClientShortlist(auth.ctx, roleId)
    const sentToClient = new Set((shortlist?.entries ?? []).map((e) => e.ref))
    const allowed = refs.filter((r) => sentToClient.has(r))
    const refused = refs.filter((r) => !sentToClient.has(r)).map((r) => ({ candidateRef: r, because: "not on the shortlist sent to you" }))
    if (allowed.length === 0) return NextResponse.json({ invited: [], skipped: refused }, { status: 400 })

    const result = await inviteCohort(tie.agencyId, roleId, tie.contactId, allowed, auth.ctx.userId)
    return NextResponse.json({ ...result, skipped: [...result.skipped, ...refused] }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

/** The client's scheduling board: the whole cohort, and what each needs. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })
    const [board, wave] = await Promise.all([
      getCohortBoard({ agencyId: tie.agencyId, userId: auth.ctx.userId, role: "viewer" }, roleId),
      getWaveState(tie.agencyId, roleId),
    ])
    const plan = planRelease({
      reserveSize: wave.reserve.length,
      awaiting: wave.awaiting,
      openWindows: wave.openWindows,
      waveSize: wave.waveSize,
      waveStillRunning: wave.nextReleaseAt !== null && Date.parse(wave.nextReleaseAt) > Date.now(),
    })
    // DISCLOSURE (22 Sep 2026). getCohortBoard carries live candidate names
    // for every round on the role — the recruiter's view. The client sees
    // only people on the shortlist sent to THEM, named as that snapshot names
    // them (and not at all if erased). Everyone else is not theirs to see.
    const shortlist = await getClientShortlist(auth.ctx, roleId)
    const sent = new Map((shortlist?.entries ?? []).map((e) => [e.ref, e]))
    const members = board.members
      .filter((m) => sent.has(m.candidateRef))
      .map((m) => {
        const e = sent.get(m.candidateRef)!
        return { ...m, candidateName: e.redacted || !e.fullName ? m.candidateRef : e.fullName }
      })
    return NextResponse.json({ ...board, members, wave: { ...wave, plan } })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

/** Send one person's booking link again. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const roundId = typeof body?.roundId === "string" ? body.roundId : ""
    if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 })
    const result = await remindCohortMember(
      { agencyId: tie.agencyId, userId: auth.ctx.userId, role: "viewer" },
      roleId,
      roundId
    )
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
