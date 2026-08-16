/**
 * Taking a hiring manager's access away.
 *
 * DELETE clears agency.client_contacts.user_id, so the next
 * requireHiringContext() simply does not see the link and access dies on the
 * following request, with no session to hunt down. It also revokes any live
 * un-accepted invite for that contact, so an old email sitting in an inbox
 * cannot undo the removal.
 *
 * This is deliberately separate from DELETE on the invite route. Revoking an
 * invite retracts an offer nobody took up; this retracts a grant somebody is
 * using. Conflating them is how "I revoked it" turns into "they still have
 * access".
 *
 * The contact row, its submissions and the whole attribution trail are
 * untouched: this removes a grant, it does not erase a person from the
 * agency's records. Audit-coupled, in lib/agency/client-auth.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { unlinkClientContact } from "@/lib/agency/client-auth"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }
    if (!UUID_RE.test(contactId)) {
      return NextResponse.json({ error: "Invalid contact" }, { status: 400 })
    }

    // No-ops (and writes no audit row) when the contact was never linked;
    // throws AgencyAccessError for a contact outside the caller's agency.
    await unlinkClientContact(auth.ctx, contactId)
    return NextResponse.json({ unlinked: true })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}
