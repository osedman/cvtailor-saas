import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  createJobRole,
  listJobRoles,
  requireAgencyContext,
} from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

const FIELD_LIMITS = {
  title: 200,
  company: 200,
  company_context: 4000,
  salary_band: 200,
  location: 200,
  seniority: 100,
  jd_raw: 30_000,
  recruiter_notes: 8000,
} as const

async function GET_handler() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const roles = await listJobRoles(auth.db, auth.ctx)
    return NextResponse.json({ roles, role: auth.ctx.role })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

async function POST_handler(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const body = await req.json()
    const input: Record<string, string> = {}
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      const value = body?.[field]
      if (typeof value === "string") input[field] = value.slice(0, limit)
    }

    const role = await createJobRole(auth.db, auth.ctx, input)
    return NextResponse.json({ role }, { status: 201 })
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

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/agency/roles", "GET", GET_handler)
export const POST = withTiming("/api/agency/roles", "POST", POST_handler)
