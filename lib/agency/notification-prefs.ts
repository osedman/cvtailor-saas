/**
 * Reading and writing notification preferences.
 *
 * Two layers, one table (migration 29). A row with a null user_id is the
 * agency's default; a row with a user_id is that person's own choice. The
 * precedence rule itself lives in resolvePreference() in notify.ts and is
 * imported here rather than restated, because the screen must agree with the
 * sender about what happens — a settings page that disagrees with the mailer
 * is worse than no settings page.
 *
 * Audit-coupled like the rest of the schema: every write records who changed
 * what, for whom. "Nobody told me" and "I turned that off in March" are
 * different conversations and only one of them is answerable.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import { resolvePreference } from "./notify"
import {
  SWITCHABLE_KINDS,
  type PrefValue,
  type SwitchableKind,
} from "./notification-kinds"
import type { AgencyContext } from "./types"

export type NotificationPrefsView = {
  /** What each switch shows for THIS person: their own choice, or "agency". */
  mine: Record<SwitchableKind, PrefValue>
  /** The agency default behind each one, so the screen can say what
   * "following the agency" currently means rather than just that it does. */
  defaults: Record<SwitchableKind, boolean>
  /** What actually happens for this person today, after resolution. */
  effective: Record<SwitchableKind, boolean>
  canEditDefaults: boolean
}

type PrefRow = { user_id: string | null; event_kind: string; enabled: boolean }

async function readRows(agencyId: string): Promise<PrefRow[]> {
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("notification_prefs")
    .select("user_id, event_kind, enabled")
    .eq("agency_id", agencyId)
  if (error) throw error
  return (data ?? []) as PrefRow[]
}

export async function getNotificationPrefs(ctx: AgencyContext): Promise<NotificationPrefsView> {
  const rows = await readRows(ctx.agencyId)

  const mine = {} as Record<SwitchableKind, PrefValue>
  const defaults = {} as Record<SwitchableKind, boolean>
  const effective = {} as Record<SwitchableKind, boolean>

  for (const kind of SWITCHABLE_KINDS) {
    const forKind = rows.filter((r) => r.event_kind === kind)
    const own = forKind.find((r) => r.user_id === ctx.userId)
    const agencyRow = forKind.find((r) => r.user_id === null)

    mine[kind] = own ? (own.enabled ? "on" : "off") : "agency"
    // Absent means ON, the same answer the sender gives.
    defaults[kind] = agencyRow ? agencyRow.enabled : true
    effective[kind] = resolvePreference(forKind, ctx.userId)
  }

  return { mine, defaults, effective, canEditDefaults: ctx.role === "owner" }
}

/**
 * Set (or clear) this person's own preference.
 *
 * "agency" is a DELETE, not a write of the current default. Storing the
 * resolved value would freeze it: the owner later changes the default and this
 * person, who asked to follow the agency, silently would not.
 */
export async function setMyPreference(
  ctx: AgencyContext,
  kind: SwitchableKind,
  value: PrefValue
): Promise<NotificationPrefsView> {
  const admin = agencyAdmin()

  if (value === "agency") {
    const { error } = await admin
      .from("notification_prefs")
      .delete()
      .eq("agency_id", ctx.agencyId)
      .eq("user_id", ctx.userId)
      .eq("event_kind", kind)
    if (error) throw error
  } else {
    const enabled = value === "on"
    // No upsert: the partial unique indexes are on an expression, which
    // on_conflict cannot name. Delete-then-insert, in that order, so the
    // unique index can never see two rows.
    const { error: delError } = await admin
      .from("notification_prefs")
      .delete()
      .eq("agency_id", ctx.agencyId)
      .eq("user_id", ctx.userId)
      .eq("event_kind", kind)
    if (delError) throw delError

    const { error } = await admin.from("notification_prefs").insert({
      agency_id: ctx.agencyId,
      user_id: ctx.userId,
      event_kind: kind,
      enabled,
      set_by: ctx.userId,
    })
    if (error) throw error
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "notification",
    entityRef: kind,
    action: "preference_set",
    toValue: { scope: "personal", value },
  })

  return getNotificationPrefs(ctx)
}

/**
 * Set the agency's default for one event. Owners only.
 *
 * This never touches anybody's own row: an owner decides where people start,
 * not what they get.
 */
export async function setAgencyDefault(
  ctx: AgencyContext,
  kind: SwitchableKind,
  enabled: boolean
): Promise<NotificationPrefsView> {
  assertWriter(ctx)
  if (ctx.role !== "owner") {
    throw new AgencyAccessError("only an owner can change the agency's defaults")
  }

  const admin = agencyAdmin()
  const { error: delError } = await admin
    .from("notification_prefs")
    .delete()
    .eq("agency_id", ctx.agencyId)
    .is("user_id", null)
    .eq("event_kind", kind)
  if (delError) throw delError

  const { error } = await admin.from("notification_prefs").insert({
    agency_id: ctx.agencyId,
    user_id: null,
    event_kind: kind,
    enabled,
    set_by: ctx.userId,
  })
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "notification",
    entityRef: kind,
    action: "default_set",
    toValue: { scope: "agency", enabled },
  })

  return getNotificationPrefs(ctx)
}
