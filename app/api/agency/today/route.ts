/**
 * Today: one next action per open role, from the same ladder as the role
 * header, so the queue at the top of /agencies and the chip on a role screen
 * can never disagree. The page groups rows by who is blocking (you, a
 * client, a candidate, nobody) — that grouping is the prototype's one real
 * idea about a dashboard, and it needs nothing stored.
 *
 * Cost: one batched assembly for every open role (getRoleFactsBatch), a
 * fixed number of queries whatever the role count. It was a per-role loop
 * until 10 Sep 2026, which is what made the dashboard feel slow.
 */

import { NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { getRoleFactsBatch } from "@/lib/agency/role-facts"
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
    // One batched assembly for every role, not one per role: the loop this
    // replaced ran about a dozen queries each and was the dashboard's
    // slowness (reported 10 Sep 2026). Order follows the query above.
    const facts = await getRoleFactsBatch(auth.ctx, (roles ?? []).map((r) => r.id as string), now)
    const rows = (roles ?? [])
      .map((r) => facts.get(r.id as string))
      .filter((f): f is NonNullable<typeof f> => !!f)
      /**
       * A DELIVERED HANDOVER TAKES A ROLE OUT OF THE LIVE QUEUE (16 Sep 2026).
       *
       * The query above already drops `closed`, but closing is a deliberate
       * later act — it starts the retention clock — so a role can be finished
       * in practice and still be open in the data. Two were: ROL-2408 and
       * ROL-2410 had their packs delivered on 24 August and were still
       * sitting in the live queue three weeks later.
       *
       * Delivery is the honest end: the employer becomes controller at that
       * moment. The role is not closed here and must not be — it moves to the
       * archive, which offers closing as the outstanding act it is.
       */
      .filter((f) => !f.pack?.deliveredAt)
      .map((f) => {
        const sub = deriveSubState(f)
        return {
          role: { id: f.roleId, ref: f.ref, title: f.title, company: f.company, ownerId: f.ownerId, ownerName: f.ownerName },
          phase: f.phase,
          subState: { key: sub.key, chip: sub.chip },
          next: nextAction(f, "recruiter", f.roleId),
        }
      })

    return NextResponse.json({ roles: rows, now })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
