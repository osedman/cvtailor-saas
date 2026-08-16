/**
 * The consumer's two opt-ins.
 *
 * Route handlers never touch Supabase directly — every query lives in
 * lib/matching/preferences.ts, which is also the only place either flag can
 * change, paired with its consent event. See that module's header for why
 * neither flag has an authenticated write path.
 *
 * The userId always comes from the session on this side of the wall. It is
 * never accepted from the request body: consent is the account holder's own,
 * and a route that took a user id would be a route that could record it for
 * somebody else.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit, anonRateLimitId } from "@/lib/rate-limit"
import { CONSENT_SUBJECTS, type ConsentSubject } from "@/lib/matching/limits"
import { getConsentState, listConsentEvents, setConsent } from "@/lib/matching/preferences"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 10

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    const [state, history] = await Promise.all([
      getConsentState(user.id),
      listConsentEvents(user.id),
    ])
    return NextResponse.json({ ...state, history })
  } catch (err) {
    const msg = errorMessage(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Body: { subject: 'matching' | 'enrichment', granted: boolean } */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    // Per-user, not per-IP: this is a cheap write, and the thing worth
    // bounding is one account thrashing its own consent history.
    const limited = await checkRateLimit(anonRateLimitId(`consent:${user.id}`), "auth")
    if (limited) return limited

    const body = (await req.json().catch(() => null)) as {
      subject?: string
      granted?: unknown
    } | null

    const subject = body?.subject
    if (!subject || !CONSENT_SUBJECTS.includes(subject as ConsentSubject)) {
      return NextResponse.json(
        { error: `subject must be one of: ${CONSENT_SUBJECTS.join(", ")}` },
        { status: 400 }
      )
    }
    // Strictly boolean. A missing or truthy-ish value must not be read as
    // consent — "granted" is the one field where guessing is unacceptable.
    if (typeof body?.granted !== "boolean") {
      return NextResponse.json({ error: "granted must be true or false" }, { status: 400 })
    }

    const state = await setConsent(user.id, subject as ConsentSubject, body.granted)
    const history = await listConsentEvents(user.id)
    return NextResponse.json({ ...state, history })
  } catch (err) {
    const msg = errorMessage(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
