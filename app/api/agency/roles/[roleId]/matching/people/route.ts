/**
 * The matched list for one role: people who match and chose to be seen,
 * plus the bucket for everyone else. See lib/agency/matched-people.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { listMatchedPeople } from "@/lib/agency/matched-people"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return NextResponse.json({ error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: auth.failure === "unauthenticated" ? 401 : 403 })
    return NextResponse.json(await listMatchedPeople(auth.ctx, roleId))
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
