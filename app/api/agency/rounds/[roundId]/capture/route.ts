/**
 * The capture panel's read: which of the five states this round is in.
 *
 * Resolved server-side rather than inferred in the browser from a pile of
 * nullable columns — one place decides "is this transcribed yet", so two
 * surfaces cannot disagree about it.
 *
 * Returns no recording path and no transcript text. The path is not the UI's
 * business, and the transcript is read through the dossier, where quotes are
 * mapped to requirements — never as a raw tape.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { getCaptureState } from "@/lib/agency/recordings"
import { errorMessage } from "@/lib/error-message"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency access" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const view = await getCaptureState(auth.ctx, roundId)
    if (!view) return NextResponse.json({ error: "That round does not exist." }, { status: 404 })
    return NextResponse.json(view)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
