/**
 * Agency settings — two numbers with real consequences for people who never
 * signed up to anything.
 *
 *   retention_days     how long a candidate's data survives a role closing
 *   notice_delay_days  how long before they are told you hold it (cap 28)
 *
 * Both have lived in the schema since migration 1 with sensible defaults and
 * no way to change them, so every agency has been frozen on Tailr's opinion
 * rather than their own policy.
 *
 * WRITES GO THROUGH THE SERVICE ROLE WITH AN AUDIT ROW, even though
 * agency.agencies is authenticated-writable by owners under RLS. Changing how
 * long you keep people is exactly the kind of act that should be answerable
 * later, and the screen carries an AUDIT LOGGED pill accordingly.
 *
 * KNOWN GAP, worth closing with a one-line migration: because the table is
 * still directly writable by owners under RLS, a determined member could
 * PATCH it through PostgREST and skip the audit row. Revoking authenticated
 * UPDATE on agency.agencies would force every change through this path, which
 * is what the audit-coupling rule (AGENCIES_SCHEMA.md §4.1) asks for
 * everywhere else.
 */

import { agencyAdmin, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

// The bounds live in a server-import-free module so the settings screen can
// read them too; re-exported here so server callers have one import.
import {
  NOTICE_MAX,
  NOTICE_MIN,
  RETENTION_MAX,
  RETENTION_MIN,
} from "./settings-limits"

export { NOTICE_MAX, NOTICE_MIN, RETENTION_MAX, RETENTION_MIN }

export interface AgencySettings {
  name: string
  retentionDays: number
  noticeDelayDays: number
  /** Only owners may change these; the UI reads this rather than guessing. */
  canEdit: boolean
}

export async function getAgencySettings(ctx: AgencyContext): Promise<AgencySettings> {
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("agencies")
    .select("name, retention_days, notice_delay_days")
    .eq("id", ctx.agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new AgencyAccessError("agency not found")

  return {
    name: (data.name as string) ?? "",
    retentionDays: (data.retention_days as number) ?? 180,
    noticeDelayDays: (data.notice_delay_days as number) ?? 7,
    canEdit: ctx.role === "owner",
  }
}

export interface SettingsPatch {
  retentionDays?: number
  noticeDelayDays?: number
}

export async function updateAgencySettings(
  ctx: AgencyContext,
  patch: SettingsPatch
): Promise<AgencySettings> {
  // Not assertWriter: a recruiter can run the desk, but how long the agency
  // keeps third-party data is an owner's decision.
  if (ctx.role !== "owner") {
    throw new AgencyAccessError("only an owner can change these settings")
  }

  const admin = agencyAdmin()
  const { data: before, error: readError } = await admin
    .from("agencies")
    .select("name, retention_days, notice_delay_days")
    .eq("id", ctx.agencyId)
    .maybeSingle()
  if (readError) throw readError
  if (!before) throw new AgencyAccessError("agency not found")

  const next: Record<string, number> = {}

  if (patch.retentionDays !== undefined) {
    const v = Math.trunc(patch.retentionDays)
    if (!Number.isFinite(v) || v < RETENTION_MIN || v > RETENTION_MAX) {
      throw new Error(`Retention must be between ${RETENTION_MIN} and ${RETENTION_MAX} days`)
    }
    next.retention_days = v
  }

  if (patch.noticeDelayDays !== undefined) {
    const v = Math.trunc(patch.noticeDelayDays)
    if (!Number.isFinite(v) || v < NOTICE_MIN || v > NOTICE_MAX) {
      throw new Error(
        `The notice delay must be between ${NOTICE_MIN} and ${NOTICE_MAX} days — the cap is not adjustable`
      )
    }
    next.notice_delay_days = v
  }

  if (Object.keys(next).length === 0) {
    return {
      name: (before.name as string) ?? "",
      retentionDays: before.retention_days as number,
      noticeDelayDays: before.notice_delay_days as number,
      canEdit: true,
    }
  }

  const { data: after, error } = await admin
    .from("agencies")
    .update(next)
    .eq("id", ctx.agencyId)
    .select("name, retention_days, notice_delay_days")
    .single()
  if (error) throw error

  // from → to, so the log answers "who shortened retention, and from what".
  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: "settings",
    action: "settings_changed",
    fromValue: {
      retention_days: before.retention_days as number,
      notice_delay_days: before.notice_delay_days as number,
    },
    toValue: {
      retention_days: after.retention_days as number,
      notice_delay_days: after.notice_delay_days as number,
    },
  })

  return {
    name: (after.name as string) ?? "",
    retentionDays: after.retention_days as number,
    noticeDelayDays: after.notice_delay_days as number,
    canEdit: true,
  }
}
