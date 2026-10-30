/**
 * The two consumer opt-ins, and the only path that changes them.
 *
 * `matching` — "let roles find me". Quiet matching scans your evidence bank
 * against live roles and tells you when one fits.
 * `enrichment` — "show my evidence to a recruiter who already has my CV".
 * `discoverable` — "let recruiters see me when a role matches" (5 Sep 2026).
 *   Off by default. It is the consent for the LISTING only: a recruiter
 *   sees the person on the roles they match, and can invite them to apply;
 *   the CV and contact details still arrive only when the person applies.
 *
 * They are separate purposes and revoke independently. Consent to the first
 * does not contain the second: someone job-hunting quietly would accept
 * enrichment of an application they chose to make and be alarmed to be
 * discovered for roles they never applied to.
 *
 * WHY THIS IS A SERVER MODULE AND NOT AN RLS POLICY
 *
 * Neither flag has an authenticated write path. `match_preferences` has no
 * write policy at all, and migration 14 revokes column UPDATE on
 * `profiles.recruiter_visibility`. Both move only through `setConsent()`,
 * which writes the preference AND its append-only consent event in the same
 * operation — the same audit-coupling rule the agency schema uses.
 *
 * The reason is a promise made on screen: "Every time you change either switch
 * we keep the date and the exact wording you agreed to." A flag a client can
 * set directly cannot keep that promise, and `recruiter_visibility` spent six
 * months being exactly that.
 *
 * NOTE the event is written FIRST. If the second write fails we have a record
 * of an intention that did not take effect, which is recoverable and visible.
 * The other order risks a changed flag with no record of why — which is the
 * failure this module exists to prevent.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { CONSENT_COPY_VERSION, type ConsentSubject } from "./limits"

export interface ConsentState {
  matching: boolean
  enrichment: boolean
  discoverable: boolean
  /** When each was last turned on, null if never or currently off. */
  matchingSince: string | null
  enrichmentSince: string | null
  discoverableSince: string | null
  copyVersion: string
  /** True when the wording has moved on since they last agreed. */
  needsReconsent: boolean
}

export interface ConsentEvent {
  subject: ConsentSubject
  action: "granted" | "withdrawn"
  copyVersion: string
  createdAt: string
}

/** Read both switches. Never throws for a user who has simply never set them. */
export async function getConsentState(userId: string): Promise<ConsentState> {
  const admin = createAdminClient()

  const [{ data: prefs }, { data: profile }] = await Promise.all([
    admin
      .from("match_preferences")
      .select("matching_opt_in, opted_in_at, copy_version, discoverable, discoverable_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("recruiter_visibility, recruiter_visibility_updated_at")
      .eq("id", userId)
      .maybeSingle(),
  ])

  const matching = Boolean(prefs?.matching_opt_in)
  const enrichment = Boolean(profile?.recruiter_visibility)
  const discoverable = Boolean(prefs?.discoverable)

  return {
    matching,
    enrichment,
    matchingSince: matching ? (prefs?.opted_in_at as string | null) ?? null : null,
    discoverable,
    discoverableSince: discoverable ? (prefs?.discoverable_at as string | null) ?? null : null,
    enrichmentSince: enrichment
      ? (profile?.recruiter_visibility_updated_at as string | null) ?? null
      : null,
    copyVersion: CONSENT_COPY_VERSION,
    // Only meaningful while something is ON — nobody needs to re-agree to a
    // switch they have turned off.
    needsReconsent:
      matching && Boolean(prefs?.copy_version) && prefs?.copy_version !== CONSENT_COPY_VERSION,
  }
}

/** The consent history the settings screen shows back to the person. */
export async function listConsentEvents(userId: string, limit = 50): Promise<ConsentEvent[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("matching_consent_events")
    .select("subject, action, copy_version, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => ({
    subject: row.subject as ConsentSubject,
    action: row.action as "granted" | "withdrawn",
    copyVersion: row.copy_version as string,
    createdAt: row.created_at as string,
  }))
}

/**
 * Turn one switch on or off, recording what was agreed to.
 *
 * Takes a userId resolved from the session by the caller and nothing else —
 * no context object, no "on behalf of". There is deliberately no code path by
 * which one person's consent can be recorded for another, the same shape
 * `recordDecision` uses for interview capture on the agency side.
 */
export async function setConsent(
  userId: string,
  subject: ConsentSubject,
  granted: boolean,
  surface = "settings"
): Promise<ConsentState> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // The record first — see the module header.
  const { error: eventError } = await admin.from("matching_consent_events").insert({
    user_id: userId,
    subject,
    action: granted ? "granted" : "withdrawn",
    copy_version: CONSENT_COPY_VERSION,
    surface,
  })
  if (eventError) throw eventError

  if (subject === "matching") {
    const { error } = await admin.from("match_preferences").upsert(
      {
        user_id: userId,
        matching_opt_in: granted,
        copy_version: CONSENT_COPY_VERSION,
        // Both stamps are kept: "on since" needs the grant, and an erasure
        // request needs to show when it stopped.
        ...(granted ? { opted_in_at: now } : { opted_out_at: now }),
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
  } else if (subject === "discoverable") {
    // The listing consent. Kept on match_preferences beside the matching
    // switch it depends on; revoking is immediate because every recruiter
    // list is derived live from this flag, never snapshotted.
    const { error } = await admin.from("match_preferences").upsert(
      {
        user_id: userId,
        discoverable: granted,
        discoverable_at: granted ? now : null,
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
  } else {
    const { error } = await admin
      .from("profiles")
      .update({
        recruiter_visibility: granted,
        recruiter_visibility_updated_at: now,
      })
      .eq("id", userId)
    if (error) throw error
  }

  return getConsentState(userId)
}
