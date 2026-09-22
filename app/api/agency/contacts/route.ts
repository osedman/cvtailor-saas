/**
 * Client contacts: the agency's address book of client side people who
 * receive submissions. Authenticated writable (RLS scoped), unlike the
 * audit coupled tables, because it is the agency's own record keeping.
 *
 * Contacts are never deleted while a submission points at them (the FK is
 * restrict), so attribution on a sent shortlist cannot be erased.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const { data, error } = await auth.db
      .from("client_contacts")
      .select("id, company, email, full_name, created_at")
      .eq("agency_id", auth.ctx.agencyId)
      // Archived contacts leave the address book and every picker (22 Sep
      // 2026). They are not deleted: interview_rounds and handover_packs
      // point at them with RESTRICT, and that attribution is the point.
      .is("archived_at", null)
      .order("company")
    if (error) throw error

    return NextResponse.json({ contacts: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = await req.json()
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const company = typeof body?.company === "string" ? body.company.trim().slice(0, 200) : ""
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim().slice(0, 200) : ""

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 })
    }
    if (!company) {
      return NextResponse.json({ error: "Company required" }, { status: 400 })
    }

    const { data, error } = await auth.db
      .from("client_contacts")
      .upsert(
        {
          agency_id: auth.ctx.agencyId,
          company,
          email,
          full_name: fullName,
          created_by: auth.ctx.userId,
        },
        { onConflict: "agency_id,email" }
      )
      .select("id, company, email, full_name")
      .single()
    if (error) throw error

    return NextResponse.json({ contact: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}


/**
 * DELETE { contactId } → archive a contact.
 *
 * Archive rather than delete, and not as a compromise: `interview_rounds`
 * attributes actions to a contact with RESTRICT, and
 * `handover_packs.delivered_to_contact_id` likewise, so a hard delete of
 * anyone who has ever done anything is refused by Postgres — correctly. The
 * row stays and keeps its attribution; the person leaves the address book,
 * the recipient pickers and the role contact dropdown.
 *
 * Their portal access is a separate act and stays separate: revoking a link
 * is `/clients/[contactId]/link`, and archiving does not silently revoke,
 * because a client mid-shortlist should not lose the page they are reading
 * because someone tidied the address book. The screen says so.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const contactId = typeof body?.contactId === "string" ? body.contactId : ""
    if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 })

    const { data, error } = await auth.db
      .from("client_contacts")
      .update({ archived_at: new Date().toISOString(), archived_by: auth.ctx.userId })
      .eq("id", contactId)
      .eq("agency_id", auth.ctx.agencyId)
      .is("archived_at", null)
      .select("id")
    if (error) throw error
    // Zero rows means it was already archived, or never this agency's. Both
    // are "nothing to do" rather than a failure, and saying which would leak
    // whether the id exists.
    return NextResponse.json({ ok: true, archived: (data ?? []).length })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
