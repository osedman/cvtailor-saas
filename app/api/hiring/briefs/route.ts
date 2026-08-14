/**
 * The hiring manager's role briefs — step 1 of the interview loop.
 *
 * GET  → { briefs: HiringBrief[] } — every brief this HM has filed, newest
 *        first, across all of their links.
 * POST → { briefId } — file a new brief against one of their OWN contacts.
 *
 * The only client-supplied identifier this route accepts is `contactId`, and it
 * is NOT trusted here: submitBrief() proves it against ctx.links (resolved from
 * the session) before anything is written, and derives agency_id from that
 * link. There is deliberately no agencyId, no status and no briefId in the POST
 * body — status is always 'submitted' (accept/decline are recruiter decisions),
 * and §5.4 gives hiring managers zero RLS grants, so the service role would
 * happily honour a forged id if the code did not refuse it.
 *
 * Validation lives here rather than in lib/: the module caps silently (capText
 * truncates), which is the right behaviour for a trusted caller and the wrong
 * behaviour for a form — an HM who pastes 5,000 characters of mission should be
 * told, not quietly cut. The caps below are the module's own MAX_TITLE (200)
 * and MAX_FIELD (4000); keep the two in step.
 *
 * No brief content is ever echoed into an error message or a log line — the
 * body is the client's material, and a validation failure names the field, not
 * its value.
 */

import { NextRequest, NextResponse } from "next/server"
import { listBriefsForHiringManager, submitBrief } from "@/lib/agency/briefs"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"

export const maxDuration = 30

/** Mirrors lib/agency/briefs.ts. A longer value is rejected, never truncated. */
const MAX_TITLE = 200
const MAX_FIELD = 4000

function authFail(failure: HiringFailure) {
  if (failure === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  return NextResponse.json(
    {
      error: "No client access — ask your recruiter for an invite.",
      reason: "not_linked",
    },
    { status: 403 }
  )
}

function badRequest(message: string, field: string) {
  return NextResponse.json({ error: message, field }, { status: 400 })
}

/** See the note in app/api/hiring/me/route.ts: database messages can quote a
 * row value (an email address), so only the error name and SQLSTATE code are
 * logged and a generic message is returned. */
function serverError(tag: string, error: unknown) {
  console.error(`[hiring/${tag}] failed`, {
    name: error instanceof Error ? error.name : typeof error,
    code: (error as { code?: string })?.code,
  })
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
}

/**
 * AgencyAccessError is a permission decision, not a fault: it is what
 * submitBrief throws when the posted contactId is not one of the caller's own.
 * The response is a fixed message with no detail, so probing contact ids cannot
 * distinguish "does not exist" from "belongs to someone else".
 */
function failure(tag: string, error: unknown) {
  if (error instanceof AgencyAccessError) {
    return NextResponse.json({ error: "Not allowed for that client contact." }, { status: 403 })
  }
  return serverError(tag, error)
}

/** Required free text: present, a string, non-blank once trimmed, within cap. */
function requiredText(
  raw: unknown,
  field: string,
  max: number
): { ok: true; value: string } | { ok: false; response: NextResponse } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, response: badRequest(`${field} is required.`, field) }
  }
  const value = raw.trim()
  if (value.length > max) {
    return {
      ok: false,
      response: badRequest(`${field} must be ${max} characters or fewer.`, field),
    }
  }
  return { ok: true, value }
}

/** Optional free text: absent and blank are both fine; a non-string is not. */
function optionalText(
  raw: unknown,
  field: string
): { ok: true; value: string } | { ok: false; response: NextResponse } {
  if (raw === undefined || raw === null) return { ok: true, value: "" }
  if (typeof raw !== "string") {
    return { ok: false, response: badRequest(`${field} must be text.`, field) }
  }
  const value = raw.trim()
  if (value.length > MAX_FIELD) {
    return {
      ok: false,
      response: badRequest(`${field} must be ${MAX_FIELD} characters or fewer.`, field),
    }
  }
  return { ok: true, value }
}

export async function GET() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    const briefs = await listBriefsForHiringManager(auth.ctx)
    return NextResponse.json({ briefs })
  } catch (error) {
    return failure("briefs", error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest("Invalid request body.", "body")
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Invalid request body.", "body")
    }
    const input = body as Record<string, unknown>

    const contactId = requiredText(input.contactId, "contactId", MAX_FIELD)
    if (!contactId.ok) return contactId.response

    const roleTitle = requiredText(input.roleTitle, "roleTitle", MAX_TITLE)
    if (!roleTitle.ok) return roleTitle.response

    const team = optionalText(input.team, "team")
    if (!team.ok) return team.response
    const mission = optionalText(input.mission, "mission")
    if (!mission.ok) return mission.response
    const mustHaves = optionalText(input.mustHaves, "mustHaves")
    if (!mustHaves.ok) return mustHaves.response
    const niceToHaves = optionalText(input.niceToHaves, "niceToHaves")
    if (!niceToHaves.ok) return niceToHaves.response
    const comp = optionalText(input.comp, "comp")
    if (!comp.ok) return comp.response
    const location = optionalText(input.location, "location")
    if (!location.ok) return location.response

    // contactId goes in as the caller sent it; submitBrief() is what proves it
    // against the session's links and picks the agency off that link.
    const { briefId } = await submitBrief(auth.ctx, {
      contactId: contactId.value,
      roleTitle: roleTitle.value,
      team: team.value,
      mission: mission.value,
      mustHaves: mustHaves.value,
      niceToHaves: niceToHaves.value,
      comp: comp.value,
      location: location.value,
    })

    return NextResponse.json({ briefId }, { status: 201 })
  } catch (error) {
    return failure("briefs", error)
  }
}
