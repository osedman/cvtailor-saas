/**
 * Invite preview — the ONE unauthenticated route in the hiring-manager
 * product. It exists so the accept page can say "Meridian Trust invited you"
 * before the visitor has signed in to anything.
 *
 * GET ?token=<raw> → { invite: { agencyName, company, maskedEmail } }
 *
 * Two rules govern everything below.
 *
 * 1. ONE FAILURE RESPONSE. Unknown token, revoked, expired, already accepted
 *    and orphaned contact all return the same 404 with the same message.
 *    peekInvite() already collapses them to null; this route must not
 *    re-separate them. A holder told "that link expired" has learned the token
 *    was real — which is exactly the bit an attacker is fishing for.
 *
 * 2. THE EMAIL IS MASKED. peekInvite discloses the invited address to the
 *    token holder by design (§5.4: the token is bearer proof, the address is
 *    all it buys), but whoever holds this link has NOT proved they are the
 *    invitee — a forwarded email, a shared Slack channel, a shoulder-surfed
 *    URL. Masking gives the real invitee enough to recognise their own address
 *    while giving a stranger nothing they can send mail to. Binding still
 *    requires proving mailbox ownership in /api/hiring/accept.
 *
 * Rate limited like the other token doorways (checkDoorwayLimit): a loose
 * flood ceiling per network plus a per-link limit keyed by a hash of the
 * token. Guessing is not what the limit is for — the token is 24 random bytes,
 * 192 bits, which no request rate can find — and the network ceiling still
 * binds anyone rotating tokens to fish. Until 28 Sep 2026 this was the strict
 * per-IP "share" tier (10/min), and the eleventh colleague in one office
 * opening their own invite was refused.
 *
 * Accepted limitation: anyone holding the link can exhaust its per-link bucket
 * (20/min, 200/day) and delay the invitee. It breaks neither confidentiality
 * nor binding, and the recruiter re-issuing the invite (a new token, so a new
 * bucket) clears it — the same trade booking, consent and reference accept.
 */

import { NextRequest, NextResponse } from "next/server"
import { peekInvite } from "@/lib/agency/client-auth"
import { checkDoorwayLimit } from "@/lib/rate-limit"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 15

/** The single response for every failure mode. Do not add detail to it. */
function deadLink() {
  return NextResponse.json({ error: "This invitation link is no longer valid." }, { status: 404 })
}

/**
 * "mary.jones@meridian.nhs.uk" → "m•••@meridian.nhs.uk".
 *
 * First character plus a FIXED-WIDTH ellipsis — the mask never encodes the
 * length of the local part. The domain is shown whole: it is the organisation
 * the invite is for (already named in `company`), and hiding it would leave
 * the invitee unable to tell which of their addresses to use. Anything that
 * cannot be parsed as an address masks to "•••" rather than falling back to
 * the raw value.
 */
function maskEmail(email: string): string {
  const value = (email ?? "").trim()
  const at = value.lastIndexOf("@")
  if (at <= 0 || at === value.length - 1) return "•••"
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (!local || !domain.includes(".")) return "•••"
  return `${local.slice(0, 1)}•••@${domain}`
}

async function GET_handler(req: NextRequest) {
  try {
    // The token is read (not looked up) first, because the per-link half of
    // the limit is keyed on it. The limit is still charged before any lookup
    // and before the empty-token check, so a malformed probe costs the same
    // as a well-formed one, and rotating tokens still spends the network's
    // flood ceiling.
    const token = req.nextUrl.searchParams.get("token") ?? ""
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    const limited = await checkDoorwayLimit("hiring-invite", ip, token)
    if (limited) return limited

    if (!token) return deadLink()

    const invite = await peekInvite(token)
    if (!invite) return deadLink()

    return NextResponse.json({
      invite: {
        agencyName: invite.agencyName,
        company: invite.company,
        maskedEmail: maskEmail(invite.contactEmail),
      },
    })
  } catch (error) {
    // Unauthenticated surface: the caller gets nothing but a generic failure,
    // and the log gets no database message (they can quote row values, i.e.
    // the invited email address).
    console.error("[hiring/invite] failed", {
      name: error instanceof Error ? error.name : typeof error,
      code: (error as { code?: string })?.code,
    })
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/invite", "GET", GET_handler)
