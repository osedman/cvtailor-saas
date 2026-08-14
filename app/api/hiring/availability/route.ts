/**
 * The hiring manager's own diary: offer a window, withdraw one.
 *
 * Times belong to the person whose diary they are, which is why this is on the
 * HM side and there is no recruiter equivalent. Reading them is the dashboard's
 * job (getHiringDashboard already returns slots); this route only writes.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError } from "@/lib/agency/db"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { offerSlot, withdrawSlot } from "@/lib/agency/rounds"

export const maxDuration = 15

function authFail(failure: "unauthenticated" | "not_linked") {
  return NextResponse.json(
    {
      error:
        failure === "unauthenticated"
          ? "Unauthorised"
          : "No client access — ask your recruiter for an invite.",
    },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const contactId = typeof body.contactId === "string" ? body.contactId : ""
    const startsAt = typeof body.startsAt === "string" ? body.startsAt : ""
    const endsAt = typeof body.endsAt === "string" ? body.endsAt : ""
    if (!contactId || !startsAt || !endsAt) {
      return NextResponse.json(
        { error: "contactId, startsAt and endsAt are required" },
        { status: 400 }
      )
    }

    const { slotId } = await offerSlot(auth.ctx, {
      contactId,
      startsAt,
      endsAt,
      roleId: typeof body.roleId === "string" ? body.roleId : null,
    })
    return NextResponse.json({ slotId }, { status: 201 })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    // Validation failures from the lib are written for the person offering the
    // time ("that time has already passed"), so they are worth showing.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not offer that time" },
      { status: 400 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    const slotId = new URL(req.url).searchParams.get("slotId") ?? ""
    if (!slotId) return NextResponse.json({ error: "slotId is required" }, { status: 400 })

    await withdrawSlot(auth.ctx, slotId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not withdraw that time" },
      { status: 500 }
    )
  }
}
