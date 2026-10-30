/**
 * The candidate's rights link: the capability in the Art 14 notice, the
 * closure email and the "you applied" screen that opens /rights/<token>.
 *
 * Raw-once, like every other doorway (consent, booking, reference, portal,
 * hiring invites). Until 30 Oct 2026 this one token was stored raw on the
 * candidate row, readable by every recruiter in the agency, so anyone with
 * row access could file requests as the candidate. Now each send mints a
 * fresh link, only its sha256 is stored (agency.rights_links), and the raw
 * value exists in the email alone.
 *
 * A link works until the earlier of:
 *   - its own expiry, a year after it was minted, and
 *   - 30 days after the candidate's retention date (read live, so an
 *     extended retention keeps the link alive with the data).
 * Every later email mints a new link; older links keep working until they
 * expire, so a candidate who kept the first email is not locked out.
 */

import { createHash, randomBytes } from "crypto"
import type { AgencyClient } from "./db"

const LINK_DAYS = 365
const AFTER_RETENTION_DAYS = 30
const DAY_MS = 86_400_000

export function hashRightsToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Cheap guard before touching the database on a guessed value. */
export function rightsTokenLooksPlausible(raw: string): boolean {
  return typeof raw === "string" && raw.length >= 24 && raw.length <= 96 && /^[a-f0-9]+$/i.test(raw)
}

/** Mint a link for one candidate. Returns the raw token exactly once. */
export async function mintRightsLink(
  admin: AgencyClient,
  candidate: { id: string; agencyId: string }
): Promise<string> {
  const raw = randomBytes(24).toString("hex")
  const { error } = await admin.from("rights_links").insert({
    candidate_id: candidate.id,
    agency_id: candidate.agencyId,
    token_hash: hashRightsToken(raw),
    expires_at: new Date(Date.now() + LINK_DAYS * DAY_MS).toISOString(),
  })
  if (error) throw error
  return raw
}

/**
 * The candidate a raw token opens, or null. `columns` is the candidate
 * select list the caller needs; retention_expires_at is always read too.
 */
export async function resolveRightsCandidate(
  admin: AgencyClient,
  raw: string,
  columns: string
): Promise<Record<string, unknown> | null> {
  if (!rightsTokenLooksPlausible(raw)) return null
  const { data: link } = await admin
    .from("rights_links")
    .select("candidate_id, expires_at")
    .eq("token_hash", hashRightsToken(raw))
    .maybeSingle()
  if (!link) return null
  const now = Date.now()
  if (new Date(link.expires_at as string).getTime() <= now) return null

  const { data: candidate } = await admin
    .from("candidates")
    .select(`${columns}, retention_expires_at`)
    .eq("id", link.candidate_id as string)
    .maybeSingle()
  if (!candidate) return null
  const row = candidate as unknown as Record<string, unknown>
  const retention = row.retention_expires_at as string | null
  if (retention && new Date(retention).getTime() + AFTER_RETENTION_DAYS * DAY_MS <= now) return null
  return row
}

/**
 * A fresh rights link for this email. The notice is the legal duty and the
 * link is the convenience: if minting fails the email still goes, with the
 * reply-to-the-recruiter wording the template falls back to.
 */
export async function mintRightsLinkOrNone(
  admin: AgencyClient,
  candidate: { id: string; agencyId: string }
): Promise<string | null> {
  try {
    return await mintRightsLink(admin, candidate)
  } catch (error) {
    console.error("[rights-link] mint failed", {
      name: error instanceof Error ? error.name : typeof error,
      code: (error as { code?: string })?.code,
    })
    return null
  }
}
