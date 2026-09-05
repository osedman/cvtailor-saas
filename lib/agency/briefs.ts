/**
 * Role briefs — step 1 of the interview loop for Tailr for Agencies.
 *
 * Decision record: docs/AGENCIES_SCHEMA.md §5.5. Schema:
 * supabase/migrations/20260813121000_agency_interview_loop.sql (applied).
 *
 * A brief is the hiring manager's ask, in their own words, before a job role
 * exists. The recruiter then converts it into an agency.job_roles row or
 * declines it — that half lives further down this file. This half is the HM's:
 * write one, list your own.
 *
 * The rules this module exists to enforce. Each one is a decision:
 *
 * 1. ROLE_BRIEFS IS AUDIT-COUPLED. There are no authenticated writes to it —
 *    not one policy grants a hiring manager an INSERT. Every write below goes
 *    through the service role in the SAME operation that writes the
 *    agency.audit_log row. If you are writing this table and not calling
 *    writeAudit, you are writing a bug.
 *
 * 2. HIRING MANAGERS HOLD ZERO RLS GRANTS (§5.4). Their entire access surface
 *    is service-role reads and writes shaped by code, reached only through
 *    requireHiringContext(). The service role bypasses RLS, so the filters and
 *    assertions in this file ARE the tenancy boundary — there is no second net
 *    underneath them.
 *
 * 3. NEVER TRUST A contact_id FROM A CLIENT. A submitted contactId is checked
 *    against ctx.links — the links the session resolved — and the agency_id
 *    written to the row comes from THAT LINK, never from the request. An HM
 *    who guesses another contact's uuid gets an AgencyAccessError, not a brief
 *    filed in someone else's agency.
 *
 * 4. THE BRIEF BODY NEVER ENTERS THE AUDIT LOG. mission, must_haves,
 *    nice_to_haves and comp are the client's confidential hiring material and
 *    frequently name people. The audit row carries the role title (the
 *    agency's own business data), the brief id and the contact id — enough to
 *    reconstruct who did what, and nothing a log reader is not entitled to.
 *    Same rule for error messages and log lines: no PII, ever.
 *
 * 5. EVERY TEXT FIELD IS TRIMMED AND CAPPED before it reaches the database. A
 *    free-text form on the client side of the wall is the one input here an
 *    agency does not control.
 *
 * House rule that applies here as everywhere: route handlers never touch
 * Supabase directly — all queries live in this module.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError, type AgencyClient } from "./db"
import { notify } from "./notify"
import { MAX_FIELD, MAX_JD, MAX_TITLE } from "./brief-limits"
import type { AgencyContext, BriefStatus, HiringBrief, HiringContext, HiringLink } from "./types"

/** Body fields. Generous enough for a real brief pasted from a doc, small
 * enough that a paste-bomb cannot be used to fill the table. */
// Limits now live in ./brief-limits so the form cannot drift from them.

/** The title is a headline, not a body. It is also the audit entity_ref, so it
 * stays short enough to read in a log table. */

/** A list is a list; detail reads fetch the body. Matches the dashboard cap in
 * client-auth.ts so the two surfaces cannot disagree about how much is "all". */
const MAX_BRIEFS = 200

/**
 * The columns a brief list is entitled to. Enumerated, never select('*'): the
 * body fields (mission, must_haves, nice_to_haves) belong to a detail read,
 * and decided_by is the recruiter's identity — not a client's business.
 */
const BRIEF_LIST_COLUMNS =
  "id, agency_id, contact_id, role_title, team, location, comp, status, role_id, created_at, decided_at"

/** Trim, then cap. Both, in that order — a field of 4000 spaces is blank. */
function capText(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max)
}

/**
 * Resolve a client-supplied contactId against the links the SESSION resolved.
 *
 * This is the authorisation boundary for every HM write below. The returned
 * link — not the request — is where agency_id comes from. Deliberately the
 * same error for "no such contact" and "someone else's contact": a probe
 * learns nothing either way.
 */
function linkForContact(ctx: HiringContext, contactId: string): HiringLink {
  const link = ctx.links.find((l) => l.contactId === contactId)
  if (!link) {
    throw new AgencyAccessError("contact not linked to the signed-in hiring manager")
  }
  return link
}

/** One row of BRIEF_LIST_COLUMNS in the shape the client surfaces expect. */
function toHiringBrief(row: Record<string, unknown>): HiringBrief {
  return {
    id: row.id as string,
    agency_id: row.agency_id as string,
    contact_id: row.contact_id as string,
    role_title: (row.role_title as string) ?? "",
    team: (row.team as string) ?? "",
    location: (row.location as string) ?? "",
    comp: (row.comp as string) ?? "",
    status: row.status as BriefStatus,
    role_id: (row.role_id as string | null) ?? null,
    created_at: row.created_at as string,
    decided_at: (row.decided_at as string | null) ?? null,
  }
}

// ============================================================
// HM side: writing and reading your own briefs
// ============================================================

/**
 * File a role brief as a hiring manager.
 *
 * The contact is proved against ctx.links FIRST — before anything is validated
 * and long before anything is written — and the agency the brief lands in is
 * the one on that link. The caller's own agency_id, if it sent one, is not
 * consulted and never will be.
 *
 * The blank-title check is a backstop, not the validation layer: the route
 * validates and returns a field error the form can render. Reaching this throw
 * means a caller skipped that, so it is a plain Error (a bug), not an
 * AgencyAccessError (a permission decision).
 *
 * Status is 'submitted' — the only status a client may create. accepted and
 * declined are recruiter decisions, made in the recruiter half of this file.
 * The audit row carries the title, the brief id and the contact id; the body
 * stays out of it (rule 4 above).
 */
export async function submitBrief(
  ctx: HiringContext,
  input: {
    contactId: string
    roleTitle: string
    team?: string
    mission?: string
    mustHaves?: string
    niceToHaves?: string
    comp?: string
    location?: string
    jdRaw?: string
    /** How many rounds the client expects (1-6). Advisory — see migration 24. */
    interviewRounds?: number
    /** When they want someone in seat, in their words ("ASAP", "October"). */
    startTarget?: string
  }
): Promise<{ briefId: string }> {
  const link = linkForContact(ctx, input.contactId)

  const roleTitle = capText(input.roleTitle, MAX_TITLE)
  if (!roleTitle) throw new Error("role title is required")

  const admin = agencyAdmin()

  const { data, error } = await admin
    .from("role_briefs")
    .insert({
      // From the link, never from input.
      agency_id: link.agencyId,
      contact_id: link.contactId,
      role_title: roleTitle,
      team: capText(input.team, MAX_FIELD),
      mission: capText(input.mission, MAX_FIELD),
      must_haves: capText(input.mustHaves, MAX_FIELD),
      nice_to_haves: capText(input.niceToHaves, MAX_FIELD),
      comp: capText(input.comp, MAX_FIELD),
      location: capText(input.location, MAX_FIELD),
      jd_raw: capText(input.jdRaw, MAX_JD),
      interview_rounds:
        Number.isInteger(input.interviewRounds) &&
        (input.interviewRounds as number) >= 1 &&
        (input.interviewRounds as number) <= 6
          ? input.interviewRounds
          : null,
      start_target: capText(input.startTarget, MAX_TITLE),
      status: "submitted",
    })
    .select("id")
    .single()
  if (error) throw error

  const briefId = data.id as string

  await writeAudit(admin, {
    agencyId: link.agencyId,
    actorId: ctx.userId,
    entityType: "brief",
    entityRef: roleTitle,
    action: "created",
    toValue: { brief_id: briefId, contact_id: link.contactId },
  })

  // The event this whole file was failing at: a brief filed and unseen. The
  // recruiter who invited this contact hears about it; nobody else does.
  await notify(admin, {
    kind: "brief_filed",
    agencyId: link.agencyId,
    actorId: ctx.userId,
    contactId: link.contactId,
    roleTitle,
  })

  return { briefId }
}

/**
 * Every brief this hiring manager has filed, newest first.
 *
 * Scoped to the contact ids the session resolved and, belt and braces, to the
 * agencies those contacts belong to — the service role bypasses RLS, so both
 * filters are load-bearing. A hiring manager with no links is not an error and
 * not a query: it is an empty list.
 *
 * List shape only. The body fields are a detail read, and nothing from the
 * recruiter's side of the wall (recruiter_notes, decided_by, another contact's
 * briefs) appears here — see the disclosure rule in client-auth.ts before
 * adding a column.
 */
export async function listBriefsForHiringManager(ctx: HiringContext): Promise<HiringBrief[]> {
  if (ctx.links.length === 0) return []

  const admin = agencyAdmin()
  const contactIds = ctx.links.map((l) => l.contactId)
  const agencyIds = [...new Set(ctx.links.map((l) => l.agencyId))]

  const { data, error } = await admin
    .from("role_briefs")
    .select(BRIEF_LIST_COLUMNS)
    .in("contact_id", contactIds)
    .in("agency_id", agencyIds)
    .order("created_at", { ascending: false })
    .limit(MAX_BRIEFS)
  if (error) throw error

  return (data ?? []).map((row) => toHiringBrief(row as Record<string, unknown>))
}

// ============================================================
// Recruiter side: triaging briefs, and converting one into a role
// ============================================================

/**
 * The recruiter's own projection of a brief. Separate from BRIEF_LIST_COLUMNS
 * on purpose — that constant is the CLIENT-facing shape and is mirrored by
 * getHiringDashboard in client-auth.ts, so widening it would quietly widen what
 * a hiring manager can see. Two surfaces, two column lists.
 */
const AGENCY_BRIEF_LIST_COLUMNS =
  "id, contact_id, role_title, status, role_id, created_at, decided_at, jd_raw"

/** Everything the conversion in acceptBrief needs, and nothing else. The body
 * fields appear HERE and never in an audit row (rule 4 at the top of the file). */
/**
 * EVERY column acceptBrief carries onto the minted role.
 *
 * This list is the conversion's contract, and it silently lost the JD. It
 * omitted jd_raw (added 20 Aug), so composeJdRaw() read `undefined` off the
 * row and composed from the structured fields alone — a brief with a
 * 5,108-character JD attached minted a role with an EMPTY intake box, with no
 * error anywhere. Same omission cost interview_rounds and start_target, which
 * the insert below also reads.
 *
 * Nothing in TypeScript catches this: the row is Record<string, unknown>, so
 * a missing key is `undefined` rather than a compile error. If you add a
 * column to role_briefs that the role should inherit, add it HERE — and
 * briefs-conversion.test.ts asserts every field the insert reads is on this
 * list.
 */
const BRIEF_CONVERSION_COLUMNS =
  "id, agency_id, contact_id, role_title, team, mission, must_haves, nice_to_haves, comp, location, status, role_id, jd_raw, interview_rounds, start_target"

/** A brief as the recruiter's triage queue needs it: the client's identity
 * (their own address book — never logged), and the role it became, if any. */
export interface AgencyBriefRow {
  id: string
  roleTitle: string
  company: string
  contactName: string
  status: BriefStatus
  createdAt: string
  decidedAt: string | null
  roleId: string | null
  /** The minted role's ref ('ROL-04'), resolved only when roleId is set. */
  roleRef: string | null
  /** Whether the hiring manager pasted a JD with the brief. Presence only —
   * the text itself rides into the role on accept, not into list rows. */
  hasJd: boolean
}

/**
 * Read one brief and prove it belongs to the caller's agency in the same
 * statement. The service role bypasses RLS, so the agency_id filter here IS the
 * tenancy boundary. Same error for "no such brief" and "someone else's brief":
 * a cross-tenant probe learns nothing either way.
 */
async function readOwnBrief(
  admin: AgencyClient,
  briefId: string,
  agencyId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("role_briefs")
    .select(BRIEF_CONVERSION_COLUMNS)
    .eq("id", briefId)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new AgencyAccessError("brief not found in your agency")
  return data as Record<string, unknown>
}

/** Resolve a minted role's ref, scoped to the agency like every other read. */
async function refForRole(
  admin: AgencyClient,
  roleId: string,
  agencyId: string
): Promise<string> {
  const { data, error } = await admin
    .from("job_roles")
    .select("id, ref")
    .eq("id", roleId)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new AgencyAccessError("job role not found in your agency")
  return (data.ref as string) ?? ""
}

/**
 * The resume decision, shared by acceptBrief's first read and its
 * concurrent-claim re-read so both answer identically.
 *
 * Returns the already-minted role when there is one (that is what makes a
 * double-click safe), null when the caller should go on and mint, and throws
 * for a brief that was declined — an accept must never quietly overturn a
 * decline.
 */
async function resumeAcceptedBrief(
  admin: AgencyClient,
  agencyId: string,
  brief: Record<string, unknown>
): Promise<{ roleId: string; ref: string } | null> {
  const status = brief.status as BriefStatus
  if (status === "declined") throw new AgencyAccessError("brief was declined")

  const roleId = (brief.role_id as string | null) ?? null
  if (status === "accepted" && roleId) {
    return { roleId, ref: await refForRole(admin, roleId, agencyId) }
  }
  // 'submitted' (mint it), or 'accepted' with no role (an earlier attempt
  // claimed the brief and died before the role existed — finish the job).
  return null
}

/**
 * Compose the brief body into something a human — and step 02's JD parse — can
 * actually read. Headed sections rather than a blob, because the parser looks
 * for must-haves and this is the only text it will get for a brief-born role.
 * Every section is capped again on the way out; the source fields were already
 * capped on the way in, so this is belt and braces.
 */
function composeJdRaw(brief: Record<string, unknown>): string {
  const sections: string[] = []
  // The pasted JD leads, unlabelled — it IS the document. The structured
  // brief fields follow as context: they carry the client's own emphasis,
  // which the parser should read alongside the formal text.
  const jd = capText(brief.jd_raw as string | null | undefined, MAX_JD)
  if (jd) sections.push(jd)
  const push = (heading: string, value: unknown) => {
    const text = capText(value as string | null | undefined, MAX_FIELD)
    if (text) sections.push(`${heading}\n${text}`)
  }
  push("Mission", brief.mission)
  push("Must-haves", brief.must_haves)
  push("Nice-to-haves", brief.nice_to_haves)
  return sections.join("\n\n")
}

/**
 * The recruiter's brief queue for their own agency, newest first.
 *
 * Service-role read explicitly scoped to ctx.agencyId — the service role
 * bypasses RLS, so that filter is the boundary, not a nicety. The company and
 * contact name are resolved from client_contacts (also agency-scoped) and the
 * ref from job_roles, in two lookups rather than PostgREST embeds: the same
 * idiom client-auth.ts uses, and it keeps the joins from silently widening what
 * a select returns.
 *
 * `opts.status` narrows the queue ('submitted' is the triage view). It is a
 * BriefStatus, not free text, so it can never become an injection surface.
 */
export async function listBriefsForAgency(
  ctx: AgencyContext,
  opts?: { status?: BriefStatus }
): Promise<AgencyBriefRow[]> {
  const admin = agencyAdmin()

  let query = admin
    .from("role_briefs")
    .select(AGENCY_BRIEF_LIST_COLUMNS)
    .eq("agency_id", ctx.agencyId)
  if (opts?.status) query = query.eq("status", opts.status)

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(MAX_BRIEFS)
  if (error) throw error

  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return []

  const contactIds = [
    ...new Set(rows.map((r) => r.contact_id as string).filter(Boolean)),
  ]
  const contacts = new Map<string, { company: string; fullName: string }>()
  if (contactIds.length > 0) {
    const { data: contactRows, error: contactError } = await admin
      .from("client_contacts")
      .select("id, company, full_name")
      .in("id", contactIds)
      .eq("agency_id", ctx.agencyId)
    if (contactError) throw contactError
    for (const c of contactRows ?? []) {
      contacts.set(c.id as string, {
        company: (c.company as string) ?? "",
        fullName: (c.full_name as string) ?? "",
      })
    }
  }

  const roleIds = [
    ...new Set(
      rows.map((r) => (r.role_id as string | null) ?? "").filter((v) => v !== "")
    ),
  ]
  const roleRefs = new Map<string, string>()
  if (roleIds.length > 0) {
    const { data: roleRows, error: roleError } = await admin
      .from("job_roles")
      .select("id, ref")
      .in("id", roleIds)
      .eq("agency_id", ctx.agencyId)
    if (roleError) throw roleError
    for (const r of roleRows ?? []) roleRefs.set(r.id as string, (r.ref as string) ?? "")
  }

  return rows.map((row) => {
    const contact = contacts.get(row.contact_id as string)
    const roleId = (row.role_id as string | null) ?? null
    return {
      id: row.id as string,
      roleTitle: (row.role_title as string) ?? "",
      company: contact?.company ?? "",
      contactName: contact?.fullName ?? "",
      status: row.status as BriefStatus,
      createdAt: row.created_at as string,
      decidedAt: (row.decided_at as string | null) ?? null,
      roleId,
      roleRef: roleId ? roleRefs.get(roleId) ?? null : null,
      hasJd: Boolean(((row.jd_raw as string | null) ?? "").trim()),
    }
  })
}

/**
 * Decline a brief. The client keeps the row and sees the decision — a declined
 * brief is an answer, not a disappearance.
 *
 * The decision is a CONDITIONAL update: id, agency_id and status='submitted'
 * are all in the WHERE clause, so the tenancy assertion and the
 * already-decided check happen inside the write itself and two recruiters
 * clicking at once cannot both decide. No row back means one of those three was
 * false, and they are deliberately indistinguishable in the error.
 *
 * NEVER delete the brief. role_briefs is the client's record of what they
 * asked for and the audit trail's anchor; a decline sets a status and nothing
 * else is destroyed.
 */
export async function declineBrief(
  ctx: AgencyContext,
  briefId: string,
  reason?: string
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data, error } = await admin
    .from("role_briefs")
    .update({
      status: "declined",
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", briefId)
    .eq("agency_id", ctx.agencyId)
    .eq("status", "submitted")
    .select("id, role_title, contact_id")
  if (error) throw error

  const decided = (data ?? [])[0]
  if (!decided) {
    throw new AgencyAccessError("brief not found in your agency, or already decided")
  }

  // The recruiter's own note about the role, capped like every other text
  // field. The brief body is never copied into it (rule 4).
  const declineReason = capText(reason, MAX_TITLE)

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "brief",
    entityRef: (decided.role_title as string) ?? "",
    action: "declined",
    toValue: { brief_id: briefId },
    reason: declineReason || undefined,
  })

  // The hiring manager is told their brief was answered, never why — the
  // reason is the recruiter's own note and stays in the app.
  await notify(admin, {
    kind: "brief_answered",
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    contactId: (decided.contact_id as string) ?? "",
    roleTitle: (decided.role_title as string) ?? "",
    accepted: false,
  })
}

/**
 * Accept a brief and mint the job role it becomes.
 *
 * supabase-js gives us no multi-statement transaction, so this is written to be
 * safe without one: CLAIM the brief with a conditional update first, and only
 * then ask for a ref and insert the role. Whoever flips 'submitted' →
 * 'accepted' owns the conversion; a double-click, a retried request or a second
 * recruiter finds the brief already accepted and gets the SAME role back
 * instead of a duplicate.
 *
 * THE ONE ACCEPTED FAILURE MODE: if the process dies between the claim (step 2)
 * and the insert (step 4), the brief sits 'accepted' with role_id null for as
 * long as nobody retries. The next acceptBrief call sees that state and
 * finishes the job. No duplicate role is ever minted, because the ref is only
 * requested after a claim succeeds.
 */
export async function acceptBrief(
  ctx: AgencyContext,
  briefId: string
): Promise<{ roleId: string; ref: string }> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  // 1. Read it, agency-scoped. Already converted → hand back what exists.
  const brief = await readOwnBrief(admin, briefId, ctx.agencyId)
  const resumed = await resumeAcceptedBrief(admin, ctx.agencyId, brief)
  if (resumed) return resumed

  // 2. Claim it. The conditional update is the concurrency control: only one
  //    caller can move it off 'submitted'.
  if ((brief.status as BriefStatus) === "submitted") {
    const { data: claimed, error: claimError } = await admin
      .from("role_briefs")
      .update({
        status: "accepted",
        decided_by: ctx.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", briefId)
      .eq("agency_id", ctx.agencyId)
      .eq("status", "submitted")
      .select("id")
    if (claimError) throw claimError

    if (!claimed || claimed.length === 0) {
      // Someone decided it between our read and our update. Re-read once and
      // answer with THEIR result rather than minting a second role.
      const winner = await readOwnBrief(admin, briefId, ctx.agencyId)
      const winnerResult = await resumeAcceptedBrief(admin, ctx.agencyId, winner)
      if (winnerResult) return winnerResult
      // Accepted, no role yet: the winner is mid-flight or died. Finish it.
    }
  }

  // 3. The ref comes from the service-role RPC, never from JS — it is the
  //    per-agency sequence, and only Postgres can hand it out without racing.
  const { data: ref, error: refError } = await admin.rpc("next_role_ref", {
    p_agency: ctx.agencyId,
  })
  if (refError) throw refError

  // The company on the role is the CLIENT's company, read from the agency's own
  // contact row (agency-scoped, like everything else). A contact that has since
  // been removed leaves it blank rather than failing the conversion — the
  // recruiter can fill it in on the role.
  const { data: contact, error: contactError } = await admin
    .from("client_contacts")
    .select("id, company")
    .eq("id", brief.contact_id as string)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (contactError) throw contactError

  const title = capText(brief.role_title as string | null | undefined, MAX_TITLE)

  // 4. Mint the role. It lands as a 'draft' so the recruiter reviews and parses
  //    before anything is published — accepting a brief starts the work, it
  //    does not open a role.
  const { data: role, error: roleError } = await admin
    .from("job_roles")
    .insert({
      agency_id: ctx.agencyId,
      ref,
      title: title || "Untitled role",
      company: (contact?.company as string) ?? "",
      company_context: capText(brief.team as string | null | undefined, MAX_FIELD),
      salary_band: capText(brief.comp as string | null | undefined, MAX_FIELD),
      location: capText(brief.location as string | null | undefined, MAX_FIELD),
      seniority: "",
      jd_raw: composeJdRaw(brief),
      planned_rounds: (brief.interview_rounds as number | null) ?? null,
      start_target: capText(brief.start_target as string | null | undefined, MAX_TITLE),
      // The same tie a recruiter sets at intake, so both paths converge.
      contact_id: (brief.contact_id as string | null) ?? null,
      recruiter_notes: "",
      status: "draft",
      created_by: ctx.userId,
    })
    .select("id, ref")
    .single()
  if (roleError) throw roleError

  const roleId = role.id as string
  const roleRef = (role.ref as string) ?? (ref as string)

  // 5. Point the brief at its role. This is what closes the window described
  //    above, so it happens immediately after the insert.
  const { error: stampError } = await admin
    .from("role_briefs")
    .update({ role_id: roleId })
    .eq("id", briefId)
    .eq("agency_id", ctx.agencyId)
  if (stampError) throw stampError

  // 6. Two rows: the role's own creation, and the brief's decision. Both carry
  //    the new role id so the trail joins up from either end. Titles and refs
  //    only — the brief body stays out of the log (rule 4).
  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: roleRef,
    action: "created",
    toValue: { title, brief_id: briefId },
    reason: "brief_accepted",
  })

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "brief",
    entityRef: title,
    action: "accepted",
    toValue: { brief_id: briefId, role_id: roleId, ref: roleRef },
  })

  await notify(admin, {
    kind: "brief_answered",
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    contactId: (brief.contact_id as string) ?? "",
    roleTitle: title,
    accepted: true,
  })

  return { roleId, ref: roleRef }
}
