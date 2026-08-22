/**
 * THE hiring-manager (client actor) server layer for Tailr for Agencies.
 *
 * Decision record: docs/AGENCIES_SCHEMA.md §5.4 and §5.5 (13 Aug 2026).
 * Schema: supabase/migrations/20260813120000_agency_client_auth.sql and
 * 20260813121000_agency_interview_loop.sql (both already applied).
 *
 * The five rules this module exists to enforce — every one of them was a
 * decision, not a default:
 *
 * 1. ONE AUTH POOL. auth.users is the person. Consumer (public.profiles),
 *    recruiter (agency.members) and hiring manager (a linked
 *    agency.client_contacts row) are orthogonal HATS the same person may
 *    hold. Nothing here forks an account, and nothing here reads or writes
 *    the consumer plane.
 *
 * 2. LINKAGE IS INVITE-ONLY. client_contacts.user_id is bound in exactly one
 *    place — acceptInvite() — and only after the signed-in user's email is
 *    proven to match the contact's. There is NO email-matching self-claim:
 *    "an agency once typed your address" must never become account access,
 *    and every grant keeps its who-authorised-this attribution (the invite
 *    row plus an audit entry). A leaked invite link is therefore useless to
 *    anyone but the named mailbox.
 *
 * 3. HIRING MANAGERS HAVE ZERO RLS GRANTS. There is not one policy for them
 *    anywhere in the agency schema, by design — live recruiter tables hold
 *    material a client must never see, so a read policy would be one mistake
 *    away from leaking it. Every read and write below goes through the
 *    service-role client and is shaped by disclosure rules in code. Hat
 *    detection is a service-role lookup of client_contacts by auth.uid().
 *
 * 4. AUDIT COUPLING. Every write to an audit-coupled table happens through
 *    the service role in the SAME operation that writes the agency.audit_log
 *    row. Invite create / revoke / accept / unlink all land in the log.
 *
 * 5. RAW-ONCE TOKENS. randomBytes(24).toString('base64url') is generated,
 *    returned to the caller exactly once, and only its sha256 is stored. A
 *    leaked database cannot mint a working invite link. Invites are looked up
 *    BY HASH in SQL — never "fetch all and compare in JS".
 *
 * House rules that apply here: route handlers never touch Supabase directly
 * (all queries live in this module), and no PII — emails, candidate names, CV
 * text — is ever put into a log line, an audit entity_ref, or an error
 * message.
 */

import { createHash, randomBytes } from "crypto"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError, type AgencyClient } from "./db"
import type {
  AgencyContext,
  BriefStatus,
  ClientAccessRow,
  ClientAccessState,
  HiringBrief,
  HiringContext,
  HiringDashboard,
  HiringFailure,
  HiringLink,
  HiringRound,
  HiringSlot,
  RoundDecision,
  RoundStatus,
} from "./types"

// Re-exported so callers can import the client-actor vocabulary from the one
// module they already need. The definitions live in ./types with the rest of
// the schema vocabulary.
export type {
  ClientAccessRow,
  ClientAccessState,
  HiringBrief,
  HiringContext,
  HiringDashboard,
  HiringFailure,
  HiringLink,
  HiringRound,
  HiringSlot,
} from "./types"

/** Default invite lifetime. Long enough for a hiring manager who checks email
 * weekly, short enough that a forwarded link goes stale on its own. */
export const INVITE_TTL_DAYS = 14

/** Raw tokens are 24 bytes base64url = 32 chars. The window matches the
 * portal's guard so a junk path segment never reaches the database. */
const MIN_TOKEN_LENGTH = 16
const MAX_TOKEN_LENGTH = 64

/** Payload caps. A dashboard is a dashboard; detail routes paginate. */
const MAX_BRIEFS = 200
const MAX_SLOTS = 500
const MAX_ROUNDS = 500

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Emails are compared case-insensitively and trimmed, nothing more. No
 * plus-address stripping, no dot-folding: those are provider-specific
 * guesses, and guessing wrong here means granting access to the wrong
 * mailbox. */
function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function tokenLooksPlausible(raw: string): boolean {
  return (
    typeof raw === "string" &&
    raw.length >= MIN_TOKEN_LENGTH &&
    raw.length <= MAX_TOKEN_LENGTH
  )
}

/** Resolve agency display names for a set of ids in one round trip. */
async function agencyNames(
  admin: AgencyClient,
  agencyIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (agencyIds.length === 0) return names
  const { data, error } = await admin.from("agencies").select("id, name").in("id", agencyIds)
  if (error) throw error
  for (const row of data ?? []) names.set(row.id as string, (row.name as string) ?? "")
  return names
}

/**
 * Guard for every recruiter-side write below: the contact must belong to the
 * caller's agency. The service role bypasses RLS, so this assertion IS the
 * tenancy boundary — never skip it.
 */
async function assertOwnContact(
  admin: AgencyClient,
  contactId: string,
  agencyId: string
): Promise<{ id: string; company: string; user_id: string | null }> {
  const { data, error } = await admin
    .from("client_contacts")
    .select("id, agency_id, company, user_id")
    .eq("id", contactId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.agency_id !== agencyId) {
    // Deliberately identical message for "does not exist" and "belongs to
    // someone else" — a cross-tenant probe learns nothing.
    throw new AgencyAccessError("client contact not found in caller's agency")
  }
  return {
    id: data.id as string,
    company: (data.company as string) ?? "",
    user_id: (data.user_id as string | null) ?? null,
  }
}

// ============================================================
// Hat detection (HM side)
// ============================================================

/**
 * Resolve the caller's hiring-manager hat from the session.
 *
 * Two steps, and the split matters: auth.uid() comes from the USER-scoped
 * client (the session cookie is the only thing that proves who they are),
 * then the contact lookup runs under the SERVICE ROLE because hiring managers
 * have no RLS grants — a user-scoped read of client_contacts returns nothing
 * for them, forever, by design.
 *
 * Holding no link is not an error: it is the ordinary state of every consumer
 * and every recruiter in the system. Callers render the "no client access"
 * surface, they do not throw.
 */
export async function requireHiringContext(): Promise<
  { ok: true; ctx: HiringContext } | { ok: false; failure: HiringFailure }
> {
  const cookieStore = await cookies()
  const sessionClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Read-only in route handlers; the proxy refreshes sessions.
        },
      },
    }
  )

  const {
    data: { user },
  } = await sessionClient.auth.getUser()
  if (!user) return { ok: false, failure: "unauthenticated" }

  const admin = agencyAdmin()
  const { data: contacts, error } = await admin
    .from("client_contacts")
    .select("id, agency_id, company, full_name")
    .eq("user_id", user.id)
  if (error) throw error
  if (!contacts || contacts.length === 0) return { ok: false, failure: "not_linked" }

  const names = await agencyNames(admin, [
    ...new Set(contacts.map((c) => c.agency_id as string)),
  ])

  const links: HiringLink[] = contacts
    .map((c) => ({
      contactId: c.id as string,
      agencyId: c.agency_id as string,
      agencyName: names.get(c.agency_id as string) ?? "",
      company: (c.company as string) ?? "",
      fullName: (c.full_name as string) ?? "",
    }))
    // Stable order so a multi-agency HM sees the same switcher every time.
    .sort((a, b) => a.agencyName.localeCompare(b.agencyName) || a.company.localeCompare(b.company))

  return {
    ok: true,
    ctx: {
      userId: user.id,
      // The email on the session, not the contact row: the two matched at
      // accept time and the session is the live truth about this person.
      email: normaliseEmail(user.email),
      links,
    },
  }
}

// ============================================================
// Recruiter side: granting, revoking and listing client access
// ============================================================

/**
 * Mint an invite for one of the caller's own client contacts.
 *
 * Exactly one live invite exists per contact: any earlier un-accepted,
 * un-revoked invite is revoked here first, so "resend the invite" cannot
 * leave two working links in two inboxes. Already-accepted invites are left
 * alone — they are the historical record of a grant, and revoking access
 * after acceptance is unlinkClientContact()'s job.
 *
 * The raw token is returned ONCE and never stored; the caller emails it (via
 * the existing magic-link/sendEmail path) and forgets it. Neither the raw
 * token nor the contact's email ever reaches the audit log: entity_ref is the
 * contact's COMPANY, which is the agency's own business data.
 */
export async function createClientInvite(
  ctx: AgencyContext,
  contactId: string
): Promise<{ inviteId: string; rawToken: string; expiresAt: string }> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const contact = await assertOwnContact(admin, contactId, ctx.agencyId)

  const nowIso = new Date().toISOString()

  const { data: superseded, error: supersedeError } = await admin
    .from("client_invites")
    .update({ revoked_at: nowIso })
    .eq("contact_id", contactId)
    .eq("agency_id", ctx.agencyId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
  if (supersedeError) throw supersedeError

  const rawToken = randomBytes(24).toString("base64url")
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString()

  const { data: invite, error: insertError } = await admin
    .from("client_invites")
    .insert({
      agency_id: ctx.agencyId,
      contact_id: contactId,
      token_hash: hashToken(rawToken),
      invited_by: ctx.userId,
      expires_at: expiresAt,
    })
    .select("id")
    .single()
  if (insertError) throw insertError

  if ((superseded ?? []).length > 0) {
    await writeAudit(admin, {
      agencyId: ctx.agencyId,
      actorId: ctx.userId,
      entityType: "client_invite",
      entityRef: contact.company,
      action: "revoked",
      reason: "superseded_by_reinvite",
      toValue: { contact_id: contactId, count: (superseded ?? []).length },
    })
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "client_invite",
    entityRef: contact.company,
    action: "created",
    toValue: { contact_id: contactId, invite_id: invite.id as string, expires_at: expiresAt },
  })

  return { inviteId: invite.id as string, rawToken, expiresAt }
}

/**
 * Revoke a live invite. Idempotent for an already-revoked invite (no second
 * audit row); throws AgencyAccessError for an invite outside the caller's
 * agency, and for one that has already been accepted — that grant is live
 * access now, and unlinkClientContact() is what takes it away.
 */
export async function revokeClientInvite(ctx: AgencyContext, inviteId: string): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: invite, error } = await admin
    .from("client_invites")
    .select("id, agency_id, contact_id, accepted_at, revoked_at")
    .eq("id", inviteId)
    .maybeSingle()
  if (error) throw error
  if (!invite || invite.agency_id !== ctx.agencyId) {
    throw new AgencyAccessError("invite not found in caller's agency")
  }
  if (invite.revoked_at) return
  if (invite.accepted_at) {
    throw new AgencyAccessError("invite already accepted — unlink the contact to remove access")
  }

  const contact = await assertOwnContact(admin, invite.contact_id as string, ctx.agencyId)

  const { error: updateError } = await admin
    .from("client_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("accepted_at", null)
  if (updateError) throw updateError

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "client_invite",
    entityRef: contact.company,
    action: "revoked",
    toValue: { contact_id: contact.id, invite_id: inviteId },
  })
}

/**
 * Remove a linked hiring manager's access to this agency.
 *
 * Sets client_contacts.user_id = null, so the next requireHiringContext()
 * simply does not see the link — access dies on the next request, with no
 * session to hunt down. The contact row, its submissions and its attribution
 * trail are untouched: this revokes a grant, it does not erase a person from
 * the agency's records.
 *
 * Any still-live invite for the contact is revoked at the same time.
 * Otherwise "unlink" could be undone by an old email sitting in an inbox.
 * No-ops (no audit row) when the contact was not linked.
 */
export async function unlinkClientContact(ctx: AgencyContext, contactId: string): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const contact = await assertOwnContact(admin, contactId, ctx.agencyId)
  if (!contact.user_id) return

  const nowIso = new Date().toISOString()

  const { error: unlinkError } = await admin
    .from("client_contacts")
    .update({ user_id: null })
    .eq("id", contactId)
    .eq("agency_id", ctx.agencyId)
  if (unlinkError) throw unlinkError

  const { error: revokeError } = await admin
    .from("client_invites")
    .update({ revoked_at: nowIso })
    .eq("contact_id", contactId)
    .eq("agency_id", ctx.agencyId)
    .is("accepted_at", null)
    .is("revoked_at", null)
  if (revokeError) throw revokeError

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "client_invite",
    entityRef: contact.company,
    action: "unlinked",
    fromValue: { user_id: contact.user_id },
    toValue: { contact_id: contactId, user_id: null },
  })
}

/**
 * The recruiter's "who has client access" table.
 *
 * Service-role read, explicitly scoped to ctx.agencyId (the service role
 * bypasses RLS, so the filter is the boundary). Returns the contact's email
 * because this is the agency's own address book — the same data
 * /api/agency/contacts already returns — but it must never be logged or put
 * in an audit entity_ref.
 */
export async function listClientAccess(ctx: AgencyContext): Promise<ClientAccessRow[]> {
  const admin = agencyAdmin()

  const { data: contacts, error } = await admin
    .from("client_contacts")
    .select("id, company, email, full_name, user_id")
    .eq("agency_id", ctx.agencyId)
    .order("company")
  if (error) throw error
  if (!contacts || contacts.length === 0) return []

  const { data: invites, error: inviteError } = await admin
    .from("client_invites")
    .select("id, contact_id, expires_at, accepted_at, revoked_at, created_at")
    .eq("agency_id", ctx.agencyId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
  if (inviteError) throw inviteError

  // Newest live invite per contact. createClientInvite guarantees at most
  // one, but ordering makes this correct even if that ever changes.
  const liveByContact = new Map<string, { id: string; expires_at: string }>()
  for (const invite of invites ?? []) {
    const key = invite.contact_id as string
    if (!liveByContact.has(key)) {
      liveByContact.set(key, { id: invite.id as string, expires_at: invite.expires_at as string })
    }
  }

  const now = Date.now()
  return contacts.map((contact) => {
    const live = liveByContact.get(contact.id as string)
    let state: ClientAccessState = "none"
    let inviteId: string | null = null
    let expiresAt: string | null = null

    if (contact.user_id) {
      state = "linked"
    } else if (live) {
      inviteId = live.id
      expiresAt = live.expires_at
      state = new Date(live.expires_at).getTime() > now ? "invited" : "expired"
    }

    return {
      contactId: contact.id as string,
      company: (contact.company as string) ?? "",
      email: (contact.email as string) ?? "",
      fullName: (contact.full_name as string) ?? "",
      state,
      inviteId,
      expiresAt,
    }
  })
}

// ============================================================
// HM side: the accept path
// ============================================================

/**
 * Read an invite by its RAW token without binding anything — this is what the
 * accept page renders before the user has done anything.
 *
 * Returns null for every failure mode (unknown token, revoked, expired,
 * already accepted, orphaned contact) so they are indistinguishable to
 * whoever holds the link. A holder who is told "this expired" learns that the
 * token was real; a holder who is told nothing learns nothing.
 *
 * The contact's email IS disclosed to the token holder — the accept page has
 * to be able to say "this invitation is for name@company.com, sign in as that
 * address". That is the designed trade: the token is bearer proof, and the
 * email is the only thing it buys you. Binding still requires proving you own
 * that mailbox (acceptInvite).
 */
export async function peekInvite(
  rawToken: string
): Promise<{ agencyName: string; company: string; contactEmail: string } | null> {
  if (!tokenLooksPlausible(rawToken)) return null

  const admin = agencyAdmin()
  // BY HASH, in SQL. Never fetch the invite set and compare in JS.
  const { data: invite, error } = await admin
    .from("client_invites")
    .select("id, agency_id, contact_id, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle()
  if (error) throw error
  if (!invite) return null
  if (invite.revoked_at || invite.accepted_at) return null
  if (new Date(invite.expires_at as string).getTime() <= Date.now()) return null

  const [{ data: contact }, names] = await Promise.all([
    admin
      .from("client_contacts")
      .select("company, email")
      .eq("id", invite.contact_id as string)
      .maybeSingle(),
    agencyNames(admin, [invite.agency_id as string]),
  ])
  if (!contact) return null

  return {
    agencyName: names.get(invite.agency_id as string) ?? "",
    company: (contact.company as string) ?? "",
    contactEmail: (contact.email as string) ?? "",
  }
}

/**
 * THE accept path — the only place in the codebase that binds
 * client_contacts.user_id.
 *
 * Every condition is checked here, in this order:
 *   1. the token hashes to a real invite,
 *   2. it is not revoked, not expired, not already accepted,
 *   3. the contact still exists,
 *   4. the SIGNED-IN user's email equals the contact's email
 *      (case-insensitive, trimmed).
 *
 * Step 4 is the one that matters. Without it, a forwarded or leaked invite
 * link would let any signed-in person on the internet claim a hiring
 * manager's seat at an agency they have nothing to do with. Mismatches are
 * rejected AND audited — a failed claim on a live link is exactly the event a
 * recruiter should be able to see afterwards.
 *
 * The invite is claimed with a conditional update (`accepted_at is null`)
 * before the contact is bound, so two concurrent accepts cannot both win.
 * Ordinary failures return a discriminated result; only genuine database
 * faults throw.
 */
export async function acceptInvite(
  rawToken: string,
  user: { id: string; email: string }
): Promise<{ ok: true; agencyName: string } | { ok: false; reason: "invalid" | "email_mismatch" }> {
  if (!tokenLooksPlausible(rawToken)) return { ok: false, reason: "invalid" }

  const admin = agencyAdmin()
  const { data: invite, error } = await admin
    .from("client_invites")
    .select("id, agency_id, contact_id, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle()
  if (error) throw error
  if (!invite) return { ok: false, reason: "invalid" }
  if (invite.revoked_at || invite.accepted_at) return { ok: false, reason: "invalid" }
  if (new Date(invite.expires_at as string).getTime() <= Date.now()) {
    return { ok: false, reason: "invalid" }
  }

  const { data: contact, error: contactError } = await admin
    .from("client_contacts")
    .select("id, agency_id, company, email")
    .eq("id", invite.contact_id as string)
    .maybeSingle()
  if (contactError) throw contactError
  if (!contact || contact.agency_id !== invite.agency_id) return { ok: false, reason: "invalid" }

  const signedInEmail = normaliseEmail(user.email)
  const invitedEmail = normaliseEmail(contact.email as string)
  if (!signedInEmail || signedInEmail !== invitedEmail) {
    // Audited, without either address: the company plus the acting user id is
    // enough for a recruiter to act on, and neither is PII in the log.
    await writeAudit(admin, {
      agencyId: invite.agency_id as string,
      actorId: user.id,
      entityType: "client_invite",
      entityRef: (contact.company as string) ?? "",
      action: "rejected",
      reason: "email_mismatch",
      toValue: { invite_id: invite.id as string, contact_id: contact.id as string },
    })
    return { ok: false, reason: "email_mismatch" }
  }

  // Claim the invite first: whoever flips accepted_at from null wins, so a
  // double-submit or two tabs cannot both bind.
  const { data: claimed, error: claimError } = await admin
    .from("client_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id as string)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
  if (claimError) throw claimError
  if (!claimed || claimed.length === 0) return { ok: false, reason: "invalid" }

  const { error: bindError } = await admin
    .from("client_contacts")
    .update({ user_id: user.id })
    .eq("id", contact.id as string)
    .eq("agency_id", invite.agency_id as string)
  if (bindError) throw bindError

  await writeAudit(admin, {
    agencyId: invite.agency_id as string,
    actorId: user.id,
    entityType: "client_invite",
    entityRef: (contact.company as string) ?? "",
    action: "accepted",
    toValue: { invite_id: invite.id as string, contact_id: contact.id as string },
  })

  const names = await agencyNames(admin, [invite.agency_id as string])
  return { ok: true, agencyName: names.get(invite.agency_id as string) ?? "" }
}

// ============================================================
// HM side: the dashboard read
// ============================================================

/**
 * Everything the /hiring dashboard is entitled to show, and nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DISCLOSURE RULE — read this before adding a single column to a select()
 * below. The hiring manager is a CLIENT, not a colleague. These tables hold
 * the recruiter's private working material, and the whole reason hiring
 * managers were given zero RLS grants (§5.4) is that the filtering lives
 * here, in code, where it can be read and reviewed.
 *
 * NEVER return, in any shape, to a client:
 *   · job_roles.recruiter_notes      — the recruiter's private thinking
 *   · candidate_reviews.notes        — likewise, per candidate
 *   · candidates.full_name, .email, .cv_storage_path, or any CV text
 *   · candidate_evidence (any row)   — quotes, strengths, sources
 *   · score_breakdowns / overrides   — the agency's method is the agency's
 *   · another contact's briefs, slots, rounds or decisions
 *
 * A candidate appears to a client as their REF ('CAN-01') and nothing more,
 * until the recruiter deliberately discloses more through a submission
 * snapshot or a handover pack. If a future feature needs a name here, that is
 * a product decision with a DPIA attached — not a widened select.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Scoping: every query is filtered to the caller's OWN contact ids, which
 * came from the session via requireHiringContext() and never from client
 * input. agency_id is filtered too — belt and braces, since the service role
 * bypasses RLS entirely.
 *
 * The interview loop is data-only today: nothing writes briefs, slots or
 * rounds yet. Empty arrays are the honest, correct answer — render an empty
 * state, never sample content.
 */
export async function getHiringDashboard(ctx: HiringContext): Promise<HiringDashboard> {
  const empty: HiringDashboard = {
    links: ctx.links,
    briefs: [],
    slots: [],
    rounds: [],
    counts: {
      briefs: 0,
      briefsSubmitted: 0,
      briefsAccepted: 0,
      slots: 0,
      rounds: 0,
      roundsScheduled: 0,
    },
  }
  if (ctx.links.length === 0) return empty

  const admin = agencyAdmin()
  const contactIds = ctx.links.map((l) => l.contactId)
  const agencyIds = [...new Set(ctx.links.map((l) => l.agencyId))]
  const nowIso = new Date().toISOString()

  const [briefsResult, slotsResult, roundsResult] = await Promise.all([
    // Their own briefs. Body fields (mission, must_haves, nice_to_haves) are
    // deliberately not in the list payload — a detail read fetches those.
    admin
      .from("role_briefs")
      .select("id, agency_id, contact_id, role_title, team, location, comp, status, role_id, created_at, decided_at")
      .in("contact_id", contactIds)
      .in("agency_id", agencyIds)
      .order("created_at", { ascending: false })
      .limit(MAX_BRIEFS),

    // Their own availability that has not already finished and has not been
    // withdrawn. "Not finished" rather than "starts in the future" so a slot
    // running right now still shows.
    admin
      .from("availability_slots")
      .select("id, agency_id, contact_id, role_id, starts_at, ends_at")
      .in("contact_id", contactIds)
      .in("agency_id", agencyIds)
      .is("revoked_at", null)
      .gt("ends_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(MAX_SLOTS),

    // Their own rounds. candidate_id is selected ONLY to resolve the
    // candidate's REF below — it is never returned, and no other candidate
    // column is read. capture_consent_* is deliberately absent: the
    // candidate's recording consent is between them and the recruiter.
    admin
      .from("interview_rounds")
      .select("id, agency_id, contact_id, role_id, candidate_id, round_number, slot_id, scheduled_at, duration_minutes, meeting_url, status")
      .in("contact_id", contactIds)
      .in("agency_id", agencyIds)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(MAX_ROUNDS),
  ])

  if (briefsResult.error) throw briefsResult.error
  if (slotsResult.error) throw slotsResult.error
  if (roundsResult.error) throw roundsResult.error

  const briefRows = briefsResult.data ?? []
  const slotRows = slotsResult.data ?? []
  const roundRows = roundsResult.data ?? []

  // A slot is booked iff a round references it (§5.5 — there is no booked
  // column to drift). Only slot_id is read here.
  const bookedSlotIds = new Set<string>()
  const slotIds = slotRows.map((s) => s.id as string)
  if (slotIds.length > 0) {
    const { data: bookings, error: bookingError } = await admin
      .from("interview_rounds")
      .select("slot_id")
      .in("slot_id", slotIds)
    if (bookingError) throw bookingError
    for (const b of bookings ?? []) {
      if (b.slot_id) bookedSlotIds.add(b.slot_id as string)
    }
  }

  // Role titles for the rounds. `title` only — recruiter_notes, jd_raw and
  // company_context stay on the recruiter's side of the wall.
  const roleIds = [...new Set(roundRows.map((r) => r.role_id as string).filter(Boolean))]
  const roleTitles = new Map<string, string>()
  if (roleIds.length > 0) {
    const { data: roles, error: roleError } = await admin
      .from("job_roles")
      .select("id, title")
      .in("id", roleIds)
    if (roleError) throw roleError
    for (const role of roles ?? []) roleTitles.set(role.id as string, (role.title as string) ?? "")
  }

  // Candidate REFS for the rounds. `id, ref` — the select is this narrow on
  // purpose. Adding full_name here would leak identity to the client.
  const candidateIds = [...new Set(roundRows.map((r) => r.candidate_id as string).filter(Boolean))]
  const candidateRefs = new Map<string, string>()
  if (candidateIds.length > 0) {
    const { data: candidates, error: candidateError } = await admin
      .from("candidates")
      .select("id, ref")
      .in("id", candidateIds)
    if (candidateError) throw candidateError
    for (const c of candidates ?? []) candidateRefs.set(c.id as string, (c.ref as string) ?? "")
  }

  // Which rounds have been WRITTEN UP. `kind = 'debrief'` is load-bearing:
  // the other kind is 'transcript', which exists only where the candidate
  // consented to a recording, so reading artifacts without this filter would
  // hand the client the candidate's consent decision by inference. The eq()
  // is the guard, and a test pins it.
  //
  // This is also the fix for a real bug: the write-up gate on /hiring lived
  // in component state, so a client who saved a write-up and reloaded got an
  // empty box and could not reach their decision without writing a second one.
  const debriefedRoundIds = new Set<string>()
  const artifactRoundIds = roundRows.map((r) => r.id as string)
  if (artifactRoundIds.length > 0) {
    const { data: artifacts, error: artifactError } = await admin
      .from("round_artifacts")
      .select("round_id")
      .eq("kind", "debrief")
      .in("round_id", artifactRoundIds)
    if (artifactError) throw artifactError
    for (const a of artifacts ?? []) debriefedRoundIds.add(a.round_id as string)
  }

  // The client's OWN decisions (round_decisions is append-only: latest wins).
  // Filtered by their contact ids so one client never sees another's call.
  const roundIds = roundRows.map((r) => r.id as string)
  const latestDecision = new Map<string, { decision: RoundDecision; created_at: string }>()
  if (roundIds.length > 0) {
    const { data: decisions, error: decisionError } = await admin
      .from("round_decisions")
      .select("round_id, decision, created_at")
      .in("round_id", roundIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
    if (decisionError) throw decisionError
    for (const d of decisions ?? []) {
      const key = d.round_id as string
      if (!latestDecision.has(key)) {
        latestDecision.set(key, {
          decision: d.decision as RoundDecision,
          created_at: d.created_at as string,
        })
      }
    }
  }

  const briefs: HiringBrief[] = briefRows.map((b) => ({
    id: b.id as string,
    agency_id: b.agency_id as string,
    contact_id: b.contact_id as string,
    role_title: (b.role_title as string) ?? "",
    team: (b.team as string) ?? "",
    location: (b.location as string) ?? "",
    comp: (b.comp as string) ?? "",
    status: b.status as BriefStatus,
    role_id: (b.role_id as string | null) ?? null,
    created_at: b.created_at as string,
    decided_at: (b.decided_at as string | null) ?? null,
  }))

  const slots: HiringSlot[] = slotRows.map((s) => ({
    id: s.id as string,
    agency_id: s.agency_id as string,
    contact_id: s.contact_id as string,
    role_id: (s.role_id as string | null) ?? null,
    starts_at: s.starts_at as string,
    ends_at: s.ends_at as string,
    booked: bookedSlotIds.has(s.id as string),
  }))

  const rounds: HiringRound[] = roundRows.map((r) => {
    const decision = latestDecision.get(r.id as string)
    return {
      id: r.id as string,
      agency_id: r.agency_id as string,
      contact_id: r.contact_id as string,
      role_id: r.role_id as string,
      role_title: roleTitles.get(r.role_id as string) ?? "",
      candidate_ref: candidateRefs.get(r.candidate_id as string) ?? "",
      round_number: r.round_number as number,
      scheduled_at: (r.scheduled_at as string | null) ?? null,
      duration_minutes: r.duration_minutes as number,
      meeting_url: (r.meeting_url as string) ?? "",
      status: r.status as RoundStatus,
      has_debrief: debriefedRoundIds.has(r.id as string),
      latest_decision: decision?.decision ?? null,
      latest_decision_at: decision?.created_at ?? null,
    }
  })

  return {
    links: ctx.links,
    briefs,
    slots,
    rounds,
    counts: {
      briefs: briefs.length,
      briefsSubmitted: briefs.filter((b) => b.status === "submitted").length,
      briefsAccepted: briefs.filter((b) => b.status === "accepted").length,
      slots: slots.length,
      rounds: rounds.length,
      roundsScheduled: rounds.filter((r) => r.status === "scheduled").length,
    },
  }
}
