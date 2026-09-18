/**
 * The interview rules for a role, and the templates they come from.
 *
 * ONE VALIDATOR. `normalise()` is the only place a settings shape is
 * checked, and both the role row and a saved template go through it — a
 * template stored as jsonb cannot otherwise be trusted to fit the columns
 * it will be applied to. Every bound here matches the migration's checks,
 * so a value that passes this cannot be rejected by Postgres.
 *
 * Rules, never appointments. Nothing in this file knows about a candidate
 * or a slot; it knows how long an interview is, how much warning someone is
 * owed, and how many the manager will sit in a day.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"
import {
  DEFAULT_SETTINGS,
  normalise,
  resolveSettingsRows,
  type InterviewSettings,
  type LocationKind,
  type ReschedulePolicy,
  type SettingsSource,
} from "./interview-rules"

export { DEFAULT_SETTINGS, normalise }
export type { InterviewSettings, LocationKind, ReschedulePolicy, SettingsSource }

function fromRow(row: Record<string, unknown>): InterviewSettings {
  return normalise({
    interviewType: row.interview_type,
    durationMinutes: row.duration_minutes,
    locationKind: row.location_kind,
    locationDetail: row.location_detail,
    windowFrom: row.window_from,
    windowTo: row.window_to,
    minNoticeHours: row.min_notice_hours,
    bufferMinutes: row.buffer_minutes,
    maxPerDay: row.max_per_day,
    reschedulePolicy: row.reschedule_policy,
    waveSize: row.wave_size,
    waveReleaseHours: row.wave_release_hours,
    rescheduleLimit: row.reschedule_limit,
  })
}

/**
 * The rules that apply to a role: its own, else the agency's default, else
 * the code default.
 *
 * BOTH LAYERS IN ONE QUERY. Two round trips would be two chances for the
 * answer to depend on timing, and the resolver is pure so it can be tested
 * without a database. `source` travels with the answer because a screen
 * showing "24 hours" has to be able to say whether somebody chose that for
 * this role, for the whole desk, or never chose at all.
 *
 * `saved` is kept for callers that only ask "has anyone set this at all", and
 * is true for either layer.
 */
export async function getInterviewSettings(
  agencyId: string,
  roleId: string
): Promise<{ settings: InterviewSettings; saved: boolean; source: SettingsSource }> {
  const { data, error } = await agencyAdmin()
    .from("interview_settings")
    .select("*")
    .eq("agency_id", agencyId)
    .or(`role_id.eq.${roleId},role_id.is.null`)
  if (error) throw error

  const { row, source } = resolveSettingsRows(
    (data ?? []) as Array<Record<string, unknown> & { role_id: string | null }>,
    roleId
  )
  return row
    ? { settings: fromRow(row), saved: true, source }
    : { settings: DEFAULT_SETTINGS, saved: false, source: "default" }
}

/**
 * The agency's own default — the row with no role on it.
 *
 * `saved` false means the desk has never set one and the code default is what
 * every role inherits.
 */
export async function getAgencyInterviewDefaults(
  agencyId: string
): Promise<{ settings: InterviewSettings; saved: boolean }> {
  const { data, error } = await agencyAdmin()
    .from("interview_settings")
    .select("*")
    .eq("agency_id", agencyId)
    .is("role_id", null)
    .maybeSingle()
  if (error) throw error
  return data ? { settings: fromRow(data), saved: true } : { settings: DEFAULT_SETTINGS, saved: false }
}

/**
 * Write one settings row, for a role or for the agency default.
 *
 * NOT AN UPSERT ANY MORE. The primary key on role_id became two PARTIAL
 * unique indexes when role_id went nullable (migration 20260918120000), and a
 * partial unique index cannot be named as a PostgREST `onConflict` target —
 * the inference needs the index predicate, which the query string cannot
 * carry. An upsert left in place would not fail loudly; it would fail on
 * conflict resolution at write time, which is worse. So the read and the
 * branch are explicit.
 *
 * `roleId` null writes the agency default.
 */
async function writeSettingsRow(
  agencyId: string,
  roleId: string | null,
  settings: InterviewSettings
): Promise<void> {
  const admin = agencyAdmin()
  const columns = {
    agency_id: agencyId,
    role_id: roleId,
    interview_type: settings.interviewType,
    duration_minutes: settings.durationMinutes,
    location_kind: settings.locationKind,
    location_detail: settings.locationDetail,
    window_from: settings.windowFrom,
    window_to: settings.windowTo,
    min_notice_hours: settings.minNoticeHours,
    buffer_minutes: settings.bufferMinutes,
    max_per_day: settings.maxPerDay,
    reschedule_policy: settings.reschedulePolicy,
    wave_size: settings.waveSize,
    wave_release_hours: settings.waveReleaseHours,
    reschedule_limit: settings.rescheduleLimit,
    updated_at: new Date().toISOString(),
  }

  const existing = admin.from("interview_settings").select("agency_id").eq("agency_id", agencyId)
  const { data: found, error: readError } = await (
    roleId === null ? existing.is("role_id", null) : existing.eq("role_id", roleId)
  ).maybeSingle()
  if (readError) throw readError

  if (found) {
    const update = admin.from("interview_settings").update(columns).eq("agency_id", agencyId)
    const { error } = await (roleId === null ? update.is("role_id", null) : update.eq("role_id", roleId))
    if (error) throw error
    return
  }
  const { error } = await admin.from("interview_settings").insert(columns)
  if (error) throw error
}

/**
 * Save the rules. Audited, because they decide what every candidate on this
 * role is offered — shortening the notice period is a change to what
 * someone is owed, not a preference.
 */
export async function setInterviewSettings(
  agencyId: string,
  roleId: string,
  actorId: string | null,
  input: unknown
): Promise<InterviewSettings> {
  const settings = normalise(input)
  const admin = agencyAdmin()

  const { data: role } = await admin.from("job_roles").select("ref").eq("agency_id", agencyId).eq("id", roleId).maybeSingle()
  if (!role) throw new AgencyAccessError("role not found in your agency")

  const before = await getInterviewSettings(agencyId, roleId)
  await writeSettingsRow(agencyId, roleId, settings)

  await writeAudit(admin, {
    agencyId,
    roleId,
    actorId,
    entityType: "interview",
    entityRef: (role.ref as string) ?? "",
    // `source`, not `saved`: with an agency default in place `saved` is true
    // for a role that has never had its own row, which would log the first
    // override on a role as an update to something that was not there.
    action: before.source === "role" ? "settings_updated" : "settings_set",
    fromValue: before.source === "role" ? { ...before.settings } : null,
    // What it inherited before, so the trail shows what the override changed
    // rather than only what it now says.
    reason: before.source === "role" ? undefined : `first rules on this role; inherited from the ${before.source === "agency" ? "agency default" : "product default"} until now`,
    toValue: { ...settings },
  })
  return settings
}

/**
 * Set the agency's default interview rules — the row with no role on it.
 *
 * Audited like a role's, and for the same reason: shortening the minimum
 * notice is a change to what every candidate on every future role is owed,
 * not a preference. If anything it deserves the louder record, because it
 * reaches roles nobody has created yet.
 *
 * Writers only. A viewer changing what candidates are owed across a whole
 * desk is the thing role separation exists to prevent.
 */
export async function setAgencyInterviewDefaults(
  ctx: AgencyContext,
  input: unknown
): Promise<InterviewSettings> {
  assertWriter(ctx)
  const settings = normalise(input)
  const before = await getAgencyInterviewDefaults(ctx.agencyId)

  await writeSettingsRow(ctx.agencyId, null, settings)

  await writeAudit(agencyAdmin(), {
    agencyId: ctx.agencyId,
    roleId: null,
    actorId: ctx.userId,
    entityType: "interview",
    entityRef: "agency default",
    action: before.saved ? "defaults_updated" : "defaults_set",
    fromValue: before.saved ? { ...before.settings } : null,
    toValue: { ...settings },
  })
  return settings
}

const text = (v: unknown, max: number, fallback = ""): string =>
  typeof v === "string" ? v.trim().slice(0, max) : fallback

export interface InterviewTemplate {
  id: string
  name: string
  settings: InterviewSettings
}

export async function listTemplates(agencyId: string): Promise<InterviewTemplate[]> {
  const { data, error } = await agencyAdmin()
    .from("interview_templates")
    .select("id, name, settings")
    .eq("agency_id", agencyId)
    .order("name")
  if (error) throw error
  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    settings: normalise(t.settings),
  }))
}

/** Save the current rules under a name, for the next role. Writers only. */
export async function saveTemplate(ctx: AgencyContext, name: string, input: unknown): Promise<InterviewTemplate> {
  assertWriter(ctx)
  const clean = text(name, 80)
  if (!clean) throw new AgencyAccessError("a template needs a name")
  const settings = normalise(input)
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("interview_templates")
    .upsert(
      { agency_id: ctx.agencyId, name: clean, settings, created_by: ctx.userId },
      { onConflict: "agency_id,name" }
    )
    .select("id, name, settings")
    .single()
  if (error) throw error
  return { id: data.id as string, name: data.name as string, settings: normalise(data.settings) }
}
