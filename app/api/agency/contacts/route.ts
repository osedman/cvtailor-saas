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
