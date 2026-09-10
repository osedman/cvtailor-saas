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
  type InterviewSettings,
  type LocationKind,
  type ReschedulePolicy,
} from "./interview-rules"

export { DEFAULT_SETTINGS, normalise }
export type { InterviewSettings, LocationKind, ReschedulePolicy }

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
  })
}

/** The role's rules, or the defaults when none have been set. */
export async function getInterviewSettings(
  agencyId: string,
  roleId: string
): Promise<{ settings: InterviewSettings; saved: boolean }> {
  const { data, error } = await agencyAdmin()
    .from("interview_settings")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .maybeSingle()
  if (error) throw error
  return data ? { settings: fromRow(data), saved: true } : { settings: DEFAULT_SETTINGS, saved: false }
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
  const { error } = await admin.from("interview_settings").upsert(
    {
      role_id: roleId,
      agency_id: agencyId,
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
      updated_at: new Date().toISOString(),
    },
    { onConflict: "role_id" }
  )
  if (error) throw error

  await writeAudit(admin, {
    agencyId,
    roleId,
    actorId,
    entityType: "interview",
    entityRef: (role.ref as string) ?? "",
    action: before.saved ? "settings_updated" : "settings_set",
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
