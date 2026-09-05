/**
 * One calendar connection per user, service-role only.
 *
 * Keyed by auth user, not by contact: a diary belongs to the person, and a
 * hiring manager linked to two agencies has one calendar. The table holds
 * sealed tokens (lib/calendar/tokens.ts) and nothing about events.
 * `busyBetween` refreshes an expired access token in place and returns busy
 * intervals only.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { PROVIDERS, type CalendarProvider, type ProviderTokens } from "./providers"
import { open, seal } from "./tokens"
import type { Interval } from "./windows"

export interface ConnectionStatus {
  provider: CalendarProvider
  label: string
  connectedAt: string
}

export async function getConnection(userId: string): Promise<ConnectionStatus | null> {
  const { data } = await createAdminClient()
    .from("calendar_connections")
    .select("provider, created_at")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) return null
  const provider = data.provider as CalendarProvider
  return { provider, label: PROVIDERS[provider].label, connectedAt: data.created_at as string }
}

export async function saveConnection(userId: string, provider: CalendarProvider, tokens: ProviderTokens): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider,
      access_token: seal(tokens.accessToken),
      refresh_token: tokens.refreshToken ? seal(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )
  if (error) throw error
}

export async function deleteConnection(userId: string): Promise<void> {
  const { error } = await createAdminClient().from("calendar_connections").delete().eq("user_id", userId)
  if (error) throw error
}

/** Busy intervals between two ISO instants, refreshing the token if it has expired. */
export async function busyBetween(userId: string, from: string, to: string): Promise<Interval[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("calendar_connections")
    .select("provider, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("no calendar connected")
  const provider = data.provider as CalendarProvider
  const def = PROVIDERS[provider]
  let access = open(data.access_token as string)
  if (Date.parse(data.expires_at as string) <= Date.now()) {
    const refresh = data.refresh_token ? open(data.refresh_token as string) : null
    if (!refresh) throw new Error("calendar access expired; connect it again")
    const fresh = await def.refresh(refresh)
    await saveConnection(userId, provider, { ...fresh, refreshToken: fresh.refreshToken ?? refresh })
    access = fresh.accessToken
  }
  return def.busy(access, from, to)
}
