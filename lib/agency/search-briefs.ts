/**
 * The client brief — the terms of a search — and the two signatures on it.
 *
 * Figma frame 25, signed off 23 Sep 2026. The pure half (option sets, the
 * state machine, the diff) is lib/agency/brief-options.ts and imports
 * nothing; this half touches the database and is audit-coupled throughout.
 *
 * THE RULE, ONCE: approved means recruiter_approved_at AND client_approved_at
 * are both set ON THE SAME VERSION ROW. Amending — by either side — writes a
 * NEW version signed by its author only, which is how the other side's
 * approval "clears": it was never on the new row. Nothing is ever un-signed.
 *
 * WHO MAY DO WHAT
 *   recruiter (AgencyContext, writer)  create · save draft · send · amend ·
 *                                      approve · discard an UNSENT draft ·
 *                                      connect a role
 *   client    (HiringContext)          read briefs sent to THEIR contact ids ·
 *                                      amend TIER-1 keys only · approve
 *
 * The client's reads are scoped to `ctx.links` contact ids, never to a
 * brief id from the URL alone — the id is the address, the link is the
 * permission (same shape as client-shortlist.ts).
 *
 * CONNECTING COPIES. connectRoleToBrief() writes the config onto the role
 * and stamps the version. Nothing on a role reads a brief live, so a brief
 * re-opened to v3 cannot change a running role by itself; the role instead
 * reports "brief has moved on" through roleBriefStatus(). Divergence between
 * the copy and the role's own settings is computed on read — no stored flag
 * to go stale.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import { getInterviewSettings, setInterviewSettings } from "./interview-settings"
import { notify } from "./notify"
import type { AgencyContext, HiringContext } from "./types"
import {
  normaliseBrief,
  briefState,
  waitingOn,
  diffBrief,
  applyClientAmendment,
  DEFAULT_BRIEF,
  type BriefConfig,
  type BriefState,
  type BriefSide,
  type BriefChange,
} from "./brief-options"

export type { BriefConfig, BriefState, BriefSide, BriefChange }

// ── shapes ────────────────────────────────────────────────────────────────

export interface BriefVersionView {
  id: string
  version: number
  config: BriefConfig
  authoredBy: BriefSide
  changedKeys: string[]
  sentAt: string | null
  recruiterApprovedAt: string | null
  clientApprovedAt: string | null
  createdAt: string
}

export interface BriefView {
  id: string
  agencyId: string
  agencyName: string
  contactId: string
  contactName: string
  company: string
  title: string
  currentVersion: number
  state: BriefState
  waitingOn: BriefSide | null
  latest: BriefVersionView
  /** Previous version's config, so a screen can show "v1 said" beside a change. */
  previous: BriefVersionView | null
  /** Roles connected to this brief, any version. */
  connectedRoles: Array<{ id: string; ref: string; title: string; version: number }>
  /** contact id → display name, for describe(). Client-side people only. */
  names: Record<string, string>
  createdAt: string
}

interface BriefRow {
  id: string
  agency_id: string
  contact_id: string
  title: string
  current_version: number
  created_at: string
  discarded_at: string | null
}
interface VersionRow {
  id: string
  brief_id: string
  version: number
  config: unknown
  authored_by_side: BriefSide
  changed_keys: string[] | null
  sent_at: string | null
  recruiter_approved_at: string | null
  client_approved_at: string | null
  created_at: string
}

const toVersion = (v: VersionRow): BriefVersionView => ({
  id: v.id,
  version: v.version,
  config: normaliseBrief(v.config),
  authoredBy: v.authored_by_side,
  changedKeys: v.changed_keys ?? [],
  sentAt: v.sent_at,
  recruiterApprovedAt: v.recruiter_approved_at,
  clientApprovedAt: v.client_approved_at,
  createdAt: v.created_at,
})

// ── reads ─────────────────────────────────────────────────────────────────

async function loadBrief(agencyId: string, briefId: string): Promise<BriefView | null> {
  const admin = agencyAdmin()
  const { data: b, error } = await admin
    .from("search_briefs")
    .select("id, agency_id, contact_id, title, current_version, created_at, discarded_at")
    .eq("id", briefId)
    .eq("agency_id", agencyId)
    .is("discarded_at", null)
    .maybeSingle()
  if (error) throw error
  if (!b) return null
  const brief = b as BriefRow

  const [{ data: versions }, { data: contact }, { data: agency }, { data: roles }] = await Promise.all([
    admin
      .from("search_brief_versions")
      .select("id, brief_id, version, config, authored_by_side, changed_keys, sent_at, recruiter_approved_at, client_approved_at, created_at")
      .eq("brief_id", briefId)
      .order("version", { ascending: false })
      .limit(2),
    admin.from("client_contacts").select("id, full_name, company").eq("id", brief.contact_id).maybeSingle(),
    admin.from("agencies").select("name").eq("id", agencyId).maybeSingle(),
    admin.from("job_roles").select("id, ref, title, brief_version").eq("brief_id", briefId).is("discarded_at", null),
  ])
  const vs = ((versions ?? []) as VersionRow[]).map(toVersion)
  const latest = vs[0]
  if (!latest) return null

  // Every client contact at this company, so rounds and offer authority
  // render as names. Company-scoped: a brief never names people at another
  // client, and a stray id from elsewhere reads as "a contact", not a leak.
  const company = (contact?.company as string) ?? ""
  const { data: people } = await admin
    .from("client_contacts")
    .select("id, full_name, email")
    .eq("agency_id", agencyId)
    .eq("company", company)
  const names: Record<string, string> = {}
  for (const p of people ?? []) names[p.id as string] = ((p.full_name as string) || (p.email as string) || "").trim() || "a contact"

  const state = briefState(
    { version: latest.version, recruiterApprovedAt: latest.recruiterApprovedAt, clientApprovedAt: latest.clientApprovedAt, authoredBy: latest.authoredBy, sentAt: latest.sentAt },
    true
  )
  return {
    id: brief.id,
    agencyId,
    agencyName: (agency?.name as string) ?? "the agency",
    contactId: brief.contact_id,
    contactName: names[brief.contact_id] ?? "the client",
    company,
    title: brief.title,
    currentVersion: brief.current_version,
    state,
    waitingOn: waitingOn(state),
    latest,
    previous: vs[1] ?? null,
    connectedRoles: ((roles ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      ref: r.ref as string,
      title: r.title as string,
      version: Number(r.brief_version ?? 0),
    })),
    names,
    createdAt: brief.created_at,
  }
}

export async function getBriefForRecruiter(ctx: AgencyContext, briefId: string): Promise<BriefView | null> {
  return loadBrief(ctx.agencyId, briefId)
}

/** The recruiter's list: every live brief, newest first, with its state. */
export async function listBriefs(ctx: AgencyContext): Promise<Array<Pick<BriefView, "id" | "title" | "company" | "contactName" | "currentVersion" | "state" | "waitingOn" | "createdAt"> & { connectedRoles: number }>> {
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("search_briefs")
    .select("id, contact_id, title, current_version, created_at")
    .eq("agency_id", ctx.agencyId)
    .is("discarded_at", null)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  const rows = (data ?? []) as Array<Record<string, unknown>>
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id as string)
  const [{ data: versions }, { data: contacts }, { data: roles }] = await Promise.all([
    admin
      .from("search_brief_versions")
      .select("brief_id, version, authored_by_side, sent_at, recruiter_approved_at, client_approved_at")
      .in("brief_id", ids),
    admin.from("client_contacts").select("id, full_name, email, company").in("id", rows.map((r) => r.contact_id as string)),
    admin.from("job_roles").select("brief_id").in("brief_id", ids).is("discarded_at", null),
  ])
  const byContact = new Map((contacts ?? []).map((c) => [c.id as string, c]))
  const roleCount = new Map<string, number>()
  for (const r of roles ?? []) roleCount.set(r.brief_id as string, (roleCount.get(r.brief_id as string) ?? 0) + 1)
  return rows.map((r) => {
    const id = r.id as string
    const current = Number(r.current_version)
    const v = ((versions ?? []) as Array<Record<string, unknown>>).find((x) => x.brief_id === id && Number(x.version) === current)
    const state = v
      ? briefState(
          {
            version: current,
            recruiterApprovedAt: (v.recruiter_approved_at as string | null) ?? null,
            clientApprovedAt: (v.client_approved_at as string | null) ?? null,
            authoredBy: v.authored_by_side as BriefSide,
            sentAt: (v.sent_at as string | null) ?? null,
          },
          true
        )
      : "draft"
    const c = byContact.get(r.contact_id as string)
    return {
      id,
      title: (r.title as string) ?? "",
      company: (c?.company as string) ?? "",
      contactName: ((c?.full_name as string) || (c?.email as string) || "").trim(),
      currentVersion: current,
      state,
      waitingOn: waitingOn(state),
      createdAt: r.created_at as string,
      connectedRoles: roleCount.get(id) ?? 0,
    }
  })
}

/**
 * Briefs a role at this company could connect to — APPROVED ones offered,
 * unsigned ones listed with the reason so nobody hunts for them (frame 25
 * band C). Company-scoped through the contact, since that is the only
 * notion of "client" the schema has.
 */
export async function listBriefsForCompany(
  ctx: AgencyContext,
  company: string
): Promise<Array<{ id: string; title: string; company: string; matchesRole: boolean; version: number; state: BriefState; contactName: string; summary: string; approvedAt: string | null }>> {
  // Every live brief on the agency, not only the role's company: a role
  // made a minute ago has no company yet, and an empty picker next to an
  // approved brief reads as "it vanished". The one that matches the role's
  // company (trimmed, case-blind) is flagged so the screen can pick it.
  const wanted = company.trim().toLowerCase()
  const all = await listBriefs(ctx)
  const out = []
  for (const b of all) {
    const full = await loadBrief(ctx.agencyId, b.id)
    if (!full) continue
    const c = full.latest.config
    const summary = [
      `${c.rounds.length} round${c.rounds.length === 1 ? "" : "s"}`,
      `decide in ${c.decisionTurnaroundDays}d`,
      c.disclosure.cv ? "CV shown" : "CV withheld",
      `${c.feePercent}% ${c.feeBasis}`,
    ].join(" · ")
    out.push({
      id: full.id,
      title: full.title,
      company: full.company,
      matchesRole: !wanted || full.company.trim().toLowerCase() === wanted,
      version: full.currentVersion,
      state: full.state,
      contactName: full.contactName,
      summary,
      approvedAt: full.state === "approved" ? full.latest.clientApprovedAt && full.latest.recruiterApprovedAt ? (full.latest.clientApprovedAt > full.latest.recruiterApprovedAt ? full.latest.clientApprovedAt : full.latest.recruiterApprovedAt) : null : null,
    })
  }
  // The role's own client first, approved first within that, then the rest.
  return out.sort((a, b) => Number(b.matchesRole) - Number(a.matchesRole) || Number(b.state === "approved") - Number(a.state === "approved"))
}

// ── the client's reads ────────────────────────────────────────────────────

function clientContactIds(ctx: HiringContext, agencyId?: string): string[] {
  return ctx.links.filter((l) => !agencyId || l.agencyId === agencyId).map((l) => l.contactId)
}

/** A brief addressed to one of the caller's own contacts, or null. */
export async function getBriefForClient(ctx: HiringContext, briefId: string): Promise<BriefView | null> {
  const admin = agencyAdmin()
  const { data: b } = await admin.from("search_briefs").select("agency_id, contact_id").eq("id", briefId).is("discarded_at", null).maybeSingle()
  if (!b) return null
  if (!clientContactIds(ctx, b.agency_id as string).includes(b.contact_id as string)) return null
  const view = await loadBrief(b.agency_id as string, briefId)
  // A draft has never left the recruiter's side. Nobody else sees it.
  if (!view || view.state === "draft") return null
  return view
}

/** Every SENT brief addressed to the caller, for the To-do and the list. */
export async function listBriefsForClient(ctx: HiringContext): Promise<Array<{ id: string; title: string; agencyName: string; version: number; state: BriefState; waitingOn: BriefSide | null; sentAt: string | null; changedKeys: string[] }>> {
  const contactIds = ctx.links.map((l) => l.contactId)
  if (contactIds.length === 0) return []
  const admin = agencyAdmin()
  const { data: briefs } = await admin
    .from("search_briefs")
    .select("id, agency_id, title, current_version")
    .in("contact_id", contactIds)
    .is("discarded_at", null)
    .order("created_at", { ascending: false })
    .limit(100)
  const rows = (briefs ?? []) as Array<Record<string, unknown>>
  if (rows.length === 0) return []
  const [{ data: versions }, { data: agencies }] = await Promise.all([
    admin.from("search_brief_versions").select("brief_id, version, authored_by_side, changed_keys, sent_at, recruiter_approved_at, client_approved_at").in("brief_id", rows.map((r) => r.id as string)),
    admin.from("agencies").select("id, name").in("id", Array.from(new Set(rows.map((r) => r.agency_id as string)))),
  ])
  const agencyName = new Map((agencies ?? []).map((a) => [a.id as string, a.name as string]))
  const out = []
  for (const r of rows) {
    const v = ((versions ?? []) as Array<Record<string, unknown>>).find((x) => x.brief_id === r.id && Number(x.version) === Number(r.current_version))
    if (!v || !v.sent_at) continue // drafts never reach the client
    const state = briefState(
      { version: Number(v.version), recruiterApprovedAt: (v.recruiter_approved_at as string | null) ?? null, clientApprovedAt: (v.client_approved_at as string | null) ?? null, authoredBy: v.authored_by_side as BriefSide, sentAt: v.sent_at as string },
      true
    )
    out.push({
      id: r.id as string,
      title: (r.title as string) ?? "",
      agencyName: agencyName.get(r.agency_id as string) ?? "your recruiter",
      version: Number(r.current_version),
      state,
      waitingOn: waitingOn(state),
      sentAt: v.sent_at as string,
      changedKeys: (v.changed_keys as string[]) ?? [],
    })
  }
  return out
}

// ── writes: recruiter ─────────────────────────────────────────────────────

async function requireContact(admin: ReturnType<typeof agencyAdmin>, agencyId: string, contactId: string) {
  const { data } = await admin.from("client_contacts").select("id, company, archived_at").eq("id", contactId).eq("agency_id", agencyId).maybeSingle()
  if (!data) throw new AgencyAccessError("that contact is not on this agency")
  if (data.archived_at) throw new AgencyAccessError("that contact has been archived — pick a live one")
  return data
}

/** A new brief, as an unsent draft at v1. Nobody but the agency sees it. */
export async function createBrief(
  ctx: AgencyContext,
  input: { contactId: string; title: string; config?: unknown; fromBriefId?: string | null }
): Promise<{ briefId: string }> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  await requireContact(admin, ctx.agencyId, input.contactId)

  // "Start from": the last brief approved with this client, or the defaults.
  let base: BriefConfig = DEFAULT_BRIEF
  if (input.fromBriefId) {
    const from = await loadBrief(ctx.agencyId, input.fromBriefId)
    if (from) base = from.latest.config
  }
  const config = normaliseBrief(input.config ?? base, base)
  const title = (input.title ?? "").trim().slice(0, 200)

  const { data: b, error } = await admin
    .from("search_briefs")
    .insert({ agency_id: ctx.agencyId, contact_id: input.contactId, title, current_version: 1, created_by: ctx.userId })
    .select("id")
    .single()
  if (error) throw error
  const briefId = b.id as string
  const { error: vErr } = await admin.from("search_brief_versions").insert({
    brief_id: briefId,
    agency_id: ctx.agencyId,
    version: 1,
    config,
    authored_by_side: "recruiter",
    authored_by: ctx.userId,
    changed_keys: [],
  })
  if (vErr) throw vErr

  await writeAudit(admin, { agencyId: ctx.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: "brief_drafted", toValue: { contact_id: input.contactId, from: input.fromBriefId ?? null } })
  return { briefId }
}

/** Edit an UNSENT draft in place. Once sent, edits are amendments. */
export async function saveDraft(ctx: AgencyContext, briefId: string, input: { title?: string; config?: unknown }): Promise<BriefView> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const view = await loadBrief(ctx.agencyId, briefId)
  if (!view) throw new AgencyAccessError("that brief is not on this agency")
  if (view.state !== "draft") throw new AgencyAccessError("this brief has been sent — changes are amendments now, and make a new version")

  const config = normaliseBrief(input.config ?? view.latest.config, view.latest.config)
  const { error } = await admin.from("search_brief_versions").update({ config }).eq("id", view.latest.id).is("sent_at", null)
  if (error) throw error
  if (typeof input.title === "string") {
    await admin.from("search_briefs").update({ title: input.title.trim().slice(0, 200), updated_at: new Date().toISOString() }).eq("id", briefId)
  }
  return (await loadBrief(ctx.agencyId, briefId))!
}

/**
 * Send the draft: it leaves the recruiter's side WITH their signature, and
 * the client is told. From here the version is immutable.
 */
export async function sendBrief(ctx: AgencyContext, briefId: string): Promise<BriefView> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const view = await loadBrief(ctx.agencyId, briefId)
  if (!view) throw new AgencyAccessError("that brief is not on this agency")
  if (view.state !== "draft") throw new AgencyAccessError("this brief has already been sent")
  if (!view.title.trim()) throw new AgencyAccessError("give the brief a title — the client sees it as the search's name")

  const now = new Date().toISOString()
  const { error } = await admin
    .from("search_brief_versions")
    .update({ sent_at: now, recruiter_approved_at: now, recruiter_approved_by: ctx.userId })
    .eq("id", view.latest.id)
    .is("sent_at", null)
  if (error) throw error

  await writeAudit(admin, { agencyId: ctx.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: "brief_sent", toValue: { version: view.latest.version, contact_id: view.contactId } })
  await notify(admin, { kind: "brief_sent", agencyId: ctx.agencyId, actorId: ctx.userId, contactId: view.contactId, briefId, briefTitle: view.title, agencyName: view.agencyName, version: view.latest.version })
  return (await loadBrief(ctx.agencyId, briefId))!
}

/**
 * A recruiter's amendment after sending: a new version, signed by them,
 * sent at once. The client's earlier signature was on the old row and stays
 * there — which is exactly what "clears" means.
 */
export async function recruiterAmend(ctx: AgencyContext, briefId: string, input: { config: unknown; title?: string }): Promise<BriefView> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const view = await loadBrief(ctx.agencyId, briefId)
  if (!view) throw new AgencyAccessError("that brief is not on this agency")
  if (view.state === "draft") return saveDraft(ctx, briefId, input)

  const config = normaliseBrief(input.config ?? view.latest.config, view.latest.config)
  const changes = diffBrief(view.latest.config, config)
  if (changes.length === 0 && (input.title === undefined || input.title.trim() === view.title)) {
    throw new AgencyAccessError("nothing changed — there is no new version to send")
  }
  const version = view.currentVersion + 1
  const now = new Date().toISOString()
  const { error } = await admin.from("search_brief_versions").insert({
    brief_id: briefId,
    agency_id: ctx.agencyId,
    version,
    config,
    authored_by_side: "recruiter",
    authored_by: ctx.userId,
    changed_keys: changes.map((c) => c.key),
    sent_at: now,
    recruiter_approved_at: now,
    recruiter_approved_by: ctx.userId,
  })
  if (error) throw error
  const patch: Record<string, unknown> = { current_version: version, updated_at: now }
  if (typeof input.title === "string" && input.title.trim()) patch.title = input.title.trim().slice(0, 200)
  await admin.from("search_briefs").update(patch).eq("id", briefId)

  await writeAudit(admin, { agencyId: ctx.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: "brief_amended", fromValue: { version: view.currentVersion }, toValue: { version, changed: changes.map((c) => c.key) } })
  await notify(admin, { kind: "brief_changed", agencyId: ctx.agencyId, actorId: ctx.userId, contactId: view.contactId, briefId, briefTitle: view.title, agencyName: view.agencyName, version, changed: changes.length })
  return (await loadBrief(ctx.agencyId, briefId))!
}

/** Sign the CURRENT version. Refused for any other, so nobody signs history. */
export async function recruiterApprove(ctx: AgencyContext, briefId: string, version: number): Promise<BriefView> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const view = await loadBrief(ctx.agencyId, briefId)
  if (!view) throw new AgencyAccessError("that brief is not on this agency")
  if (version !== view.currentVersion) throw new AgencyAccessError(`v${version} is not the current version — read v${view.currentVersion} and approve that`)
  if (view.state === "draft") throw new AgencyAccessError("send it first — a draft is not something to approve")
  if (view.latest.recruiterApprovedAt) return view

  const now = new Date().toISOString()
  const { error } = await admin
    .from("search_brief_versions")
    .update({ recruiter_approved_at: now, recruiter_approved_by: ctx.userId })
    .eq("id", view.latest.id)
    .is("recruiter_approved_at", null)
  if (error) throw error
  const after = (await loadBrief(ctx.agencyId, briefId))!
  await writeAudit(admin, { agencyId: ctx.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: after.state === "approved" ? "brief_approved_by_both" : "brief_approved_by_recruiter", toValue: { version } })
  if (after.state === "approved") {
    await notify(admin, { kind: "brief_approved", agencyId: ctx.agencyId, actorId: ctx.userId, contactId: view.contactId, briefId, briefTitle: view.title, agencyName: view.agencyName, version })
  }
  return after
}

/** Discard an UNSENT draft. A sent brief is a record of what was proposed. */
export async function discardDraft(ctx: AgencyContext, briefId: string): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const view = await loadBrief(ctx.agencyId, briefId)
  if (!view) throw new AgencyAccessError("that brief is not on this agency")
  if (view.state !== "draft") throw new AgencyAccessError("this brief has been sent to the client and stays on the record")
  const { error } = await admin.from("search_briefs").update({ discarded_at: new Date().toISOString(), discarded_by: ctx.userId }).eq("id", briefId).is("discarded_at", null)
  if (error) throw error
  await writeAudit(admin, { agencyId: ctx.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: "brief_draft_discarded" })
}

// ── writes: client ────────────────────────────────────────────────────────

/**
 * The client's amendment: TIER-1 keys only, a new version signed by them,
 * back to the recruiter. Anything else in the payload is ignored — the
 * review page only offers Change on tier-1 lines.
 */
export async function clientAmend(ctx: HiringContext, briefId: string, proposed: unknown): Promise<BriefView> {
  const view = await getBriefForClient(ctx, briefId)
  if (!view) throw new AgencyAccessError("that brief was not sent to you")
  if (view.state === "approved") throw new AgencyAccessError("this brief is approved by both sides — ask your recruiter to re-open it")
  const { config, changes } = applyClientAmendment(view.latest.config, proposed)
  if (changes.length === 0) throw new AgencyAccessError("nothing changed")

  const admin = agencyAdmin()
  const version = view.currentVersion + 1
  const now = new Date().toISOString()
  const { error } = await admin.from("search_brief_versions").insert({
    brief_id: briefId,
    agency_id: view.agencyId,
    version,
    config,
    authored_by_side: "client",
    authored_by: ctx.userId,
    changed_keys: changes.map((c) => c.key),
    sent_at: now,
    client_approved_at: now,
    client_approved_by: ctx.userId,
  })
  if (error) throw error
  await admin.from("search_briefs").update({ current_version: version, updated_at: now }).eq("id", briefId)

  await writeAudit(admin, { agencyId: view.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: "brief_amended_by_client", fromValue: { version: view.currentVersion }, toValue: { version, changed: changes.map((c) => c.key) } })
  await notify(admin, { kind: "brief_amended_by_client", agencyId: view.agencyId, actorId: ctx.userId, contactId: view.contactId, briefId, briefTitle: view.title, version, changed: changes.length })
  return (await getBriefForClient(ctx, briefId))!
}

/** The client signs the CURRENT version. */
export async function clientApprove(ctx: HiringContext, briefId: string, version: number): Promise<BriefView> {
  const view = await getBriefForClient(ctx, briefId)
  if (!view) throw new AgencyAccessError("that brief was not sent to you")
  if (version !== view.currentVersion) throw new AgencyAccessError(`v${version} is not the current version — read v${view.currentVersion} and approve that`)
  if (view.latest.clientApprovedAt) return view

  const admin = agencyAdmin()
  const now = new Date().toISOString()
  const { error } = await admin
    .from("search_brief_versions")
    .update({ client_approved_at: now, client_approved_by: ctx.userId })
    .eq("id", view.latest.id)
    .is("client_approved_at", null)
  if (error) throw error
  const after = (await getBriefForClient(ctx, briefId))!
  await writeAudit(admin, { agencyId: view.agencyId, actorId: ctx.userId, entityType: "brief", entityRef: briefId, action: after.state === "approved" ? "brief_approved_by_both" : "brief_approved_by_client", toValue: { version } })
  await notify(admin, { kind: "brief_approved_by_client", agencyId: view.agencyId, actorId: ctx.userId, contactId: view.contactId, briefId, briefTitle: view.title, version, both: after.state === "approved" })
  return after
}

// ── the role ──────────────────────────────────────────────────────────────

/**
 * Connect a role to an APPROVED brief and copy its configuration.
 *
 * What is copied onto the role itself: planned_rounds, contact_id, and the
 * interview settings that map one-to-one (first round's duration, notice,
 * buffer, max per day). The whole config is stored in brief_config with the
 * version, and consumers that need the rest — disclosure defaults at
 * submission, references at close-out, fee at placement — read the copy.
 *
 * Interview windows in the brief are TIMES OF DAY; interview_settings'
 * windowFrom/To are DATES. They are different facts and are not mapped.
 */
export async function connectRoleToBrief(ctx: AgencyContext, roleId: string, briefId: string): Promise<{ version: number }> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const view = await loadBrief(ctx.agencyId, briefId)
  if (!view) throw new AgencyAccessError("that brief is not on this agency")
  if (view.state !== "approved") throw new AgencyAccessError(`this brief is ${view.state === "draft" ? "still a draft" : `waiting on ${view.waitingOn === "client" ? "the client" : "you"}`} — a role connects only to an approved brief`)

  const { data: role } = await admin.from("job_roles").select("id, ref, title, company, brief_id, brief_version, planned_rounds, contact_id").eq("id", roleId).eq("agency_id", ctx.agencyId).is("discarded_at", null).maybeSingle()
  if (!role) throw new AgencyAccessError("that role is not on this agency")
  if (role.company && view.company && role.company.trim().toLowerCase() !== view.company.trim().toLowerCase()) {
    throw new AgencyAccessError(`this brief is with ${view.company}; the role is for ${role.company}`)
  }

  const c = view.latest.config
  const now = new Date().toISOString()
  // A role made from intake has no name yet; the brief names the search.
  // A title the recruiter typed is theirs and stays.
  const roleTitle = String(role.title ?? "").trim()
  const unnamed = !roleTitle || roleTitle.toLowerCase() === "untitled role"
  const { error } = await admin
    .from("job_roles")
    .update({
      ...(unnamed && view.title.trim() ? { title: view.title.trim() } : {}),
      brief_id: briefId,
      brief_version: view.currentVersion,
      brief_config: c,
      brief_connected_at: now,
      planned_rounds: c.rounds.length,
      contact_id: view.contactId,
      company: role.company || view.company,
      updated_at: now,
    })
    .eq("id", roleId)
    .eq("agency_id", ctx.agencyId)
  if (error) throw error

  const current = await getInterviewSettings(ctx.agencyId, roleId)
  await setInterviewSettings(ctx.agencyId, roleId, ctx.userId, {
    ...current.settings,
    durationMinutes: c.rounds[0]?.durationMinutes ?? current.settings.durationMinutes,
    minNoticeHours: c.noticeHours,
    bufferMinutes: c.bufferMinutes,
    maxPerDay: c.maxPerDay,
  })

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: role.ref as string,
    action: role.brief_id ? "brief_reconnected" : "brief_connected",
    // What the connect overwrote rides along, so a reverse can put it back.
    fromValue: { brief_id: role.brief_id ?? null, version: role.brief_version ?? null, title: role.title ?? "", planned_rounds: role.planned_rounds ?? null, contact_id: role.contact_id ?? null, company: role.company ?? "" },
    toValue: { brief_id: briefId, version: view.currentVersion },
  })
  return { version: view.currentVersion }
}

/**
 * The reverse of connect. Unlinks the brief and puts back the planned
 * rounds, contact and company the connect overwrote (from its audit row),
 * so "connect, then change your mind" leaves the role as it was. Interview
 * settings stay: they are editable on their own screen and a candidate may
 * already hold a slot under them.
 */
export async function disconnectRoleFromBrief(ctx: AgencyContext, roleId: string): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const { data: role } = await admin.from("job_roles").select("id, ref, brief_id, brief_version").eq("id", roleId).eq("agency_id", ctx.agencyId).is("discarded_at", null).maybeSingle()
  if (!role) throw new AgencyAccessError("that role is not on this agency")
  if (!role.brief_id) throw new AgencyAccessError("this role is not on a brief")
  const { data: last } = await admin
    .from("audit_log")
    .select("from_value")
    .eq("agency_id", ctx.agencyId)
    .eq("role_id", roleId)
    .in("action", ["brief_connected", "brief_reconnected"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const before = (last?.from_value ?? {}) as { title?: string; planned_rounds?: number | null; contact_id?: string | null; company?: string }
  const now = new Date().toISOString()
  const { error } = await admin
    .from("job_roles")
    .update({
      brief_id: null,
      brief_version: null,
      brief_config: null,
      brief_connected_at: null,
      ...("title" in before ? { title: before.title || "Untitled role" } : {}),
      ...("planned_rounds" in before ? { planned_rounds: before.planned_rounds ?? null } : {}),
      ...("contact_id" in before ? { contact_id: before.contact_id ?? null } : {}),
      ...(before.company ? { company: before.company } : {}),
      updated_at: now,
    })
    .eq("id", roleId)
    .eq("agency_id", ctx.agencyId)
  if (error) throw error
  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: role.ref as string,
    action: "brief_disconnected",
    fromValue: { brief_id: role.brief_id, version: role.brief_version },
    toValue: null,
  })
}

export interface RoleBriefStatus {
  briefId: string
  version: number
  title: string
  /** The brief has been approved again since — the role runs on an older version. */
  movedOnTo: number | null
  differences: Array<{ key: string; label: string; brief: string; role: string }>
}

/**
 * How the role stands against its brief, computed on read: which version it
 * runs on, whether the brief has moved on, and every place the role's own
 * settings now differ from the copy. No stored flag, so nothing goes stale.
 */
export async function roleBriefStatus(agencyId: string, roleId: string): Promise<RoleBriefStatus | null> {
  const admin = agencyAdmin()
  const { data: role } = await admin.from("job_roles").select("brief_id, brief_version, brief_config, planned_rounds, contact_id").eq("id", roleId).eq("agency_id", agencyId).maybeSingle()
  if (!role?.brief_id || !role.brief_config) return null
  const copy = normaliseBrief(role.brief_config)
  const [view, settingsRow] = await Promise.all([loadBrief(agencyId, role.brief_id as string), getInterviewSettings(agencyId, roleId)])
  const settings = settingsRow.settings

  const differences: RoleBriefStatus["differences"] = []
  const cmp = (key: string, label: string, brief: string | number | null, actual: string | number | null) => {
    if (String(brief ?? "") !== String(actual ?? "")) differences.push({ key, label, brief: String(brief ?? "—"), role: String(actual ?? "—") })
  }
  cmp("planned_rounds", "Planned rounds", copy.rounds.length, role.planned_rounds == null ? copy.rounds.length : Number(role.planned_rounds))
  // Compared by ID, shown by name. Two contacts with one display name are
  // still two people, and a brief that has since been discarded (view null)
  // is "the brief is gone", not "a difference" — the E2E found this chip
  // reporting a phantom difference no action could clear.
  if (view && String(role.contact_id ?? "") !== view.contactId) {
    differences.push({
      key: "contact_id",
      label: "Client contact",
      brief: view.names[view.contactId] ?? "the brief's contact",
      role: role.contact_id ? (view.names[role.contact_id as string] ?? "another contact") : "none",
    })
  }
  cmp("duration", "Interview length", copy.rounds[0]?.durationMinutes ?? null, settings.durationMinutes)
  cmp("notice", "Notice to candidates (h)", copy.noticeHours, settings.minNoticeHours)
  cmp("buffer", "Buffer (min)", copy.bufferMinutes, settings.bufferMinutes)
  cmp("max_per_day", "Max per day", copy.maxPerDay, settings.maxPerDay)

  return {
    briefId: role.brief_id as string,
    version: Number(role.brief_version),
    title: view?.title ?? "",
    movedOnTo: view && view.state === "approved" && view.currentVersion > Number(role.brief_version) ? view.currentVersion : null,
    differences,
  }
}
