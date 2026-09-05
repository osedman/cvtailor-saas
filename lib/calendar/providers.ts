/**
 * Calendar providers behind one interface: Google Calendar and Microsoft 365.
 *
 * Read-only, and only busy time. The product never reads an event's title,
 * attendees or body — a hiring manager connecting their diary is telling
 * Tailr when they are free, nothing else. Google: the calendar.readonly
 * scope and the freeBusy endpoint, which returns intervals only. Microsoft:
 * Calendars.Read and calendarView selected down to start, end and showAs.
 *
 * Each provider is "configured" when its client id and secret are in the
 * environment. Vercel scopes env per environment (CLAUDE.md): setting these
 * while on staging sets them for Preview only.
 */

import { getBusinessOrigin } from "@/lib/site-url"
import type { Interval } from "./windows"

export type CalendarProvider = "google" | "microsoft"

export interface ProviderTokens {
  accessToken: string
  refreshToken: string | null
  /** ISO. */
  expiresAt: string
}

interface ProviderDef {
  label: string
  configured: () => boolean
  authorizeUrl: (state: string) => string
  exchange: (code: string) => Promise<ProviderTokens>
  refresh: (refreshToken: string) => Promise<ProviderTokens>
  busy: (accessToken: string, from: string, to: string) => Promise<Interval[]>
}

export function redirectUri(provider: CalendarProvider): string {
  return `${getBusinessOrigin()}/api/hiring/calendar/callback/${provider}`
}

async function postForm(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof body.error_description === "string" ? body.error_description : `token request failed (${res.status})`)
  return body
}

function tokensFrom(body: Record<string, unknown>, previousRefresh: string | null): ProviderTokens {
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600
  return {
    accessToken: String(body.access_token ?? ""),
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : previousRefresh,
    expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000).toISOString(),
  }
}

const google: ProviderDef = {
  label: "Google Calendar",
  configured: () => !!(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
  authorizeUrl: (state) => {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
      redirect_uri: redirectUri("google"),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
  },
  exchange: async (code) =>
    tokensFrom(
      await postForm("https://oauth2.googleapis.com/token", {
        code,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri("google"),
        grant_type: "authorization_code",
      }),
      null
    ),
  refresh: async (refreshToken) =>
    tokensFrom(
      await postForm("https://oauth2.googleapis.com/token", {
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      }),
      refreshToken
    ),
  busy: async (accessToken, from, to) => {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id: "primary" }] }),
    })
    if (!res.ok) throw new Error(`Google freeBusy failed (${res.status})`)
    const body = (await res.json()) as { calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } } }
    return (body.calendars?.primary?.busy ?? []).map((b) => ({ start: b.start, end: b.end }))
  },
}

const microsoft: ProviderDef = {
  label: "Microsoft 365",
  configured: () => !!(process.env.MICROSOFT_CALENDAR_CLIENT_ID && process.env.MICROSOFT_CALENDAR_CLIENT_SECRET),
  authorizeUrl: (state) => {
    const q = new URLSearchParams({
      client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? "",
      redirect_uri: redirectUri("microsoft"),
      response_type: "code",
      response_mode: "query",
      scope: "offline_access Calendars.Read",
      state,
    })
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`
  },
  exchange: async (code) =>
    tokensFrom(
      await postForm("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        code,
        client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri("microsoft"),
        grant_type: "authorization_code",
        scope: "offline_access Calendars.Read",
      }),
      null
    ),
  refresh: async (refreshToken) =>
    tokensFrom(
      await postForm("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        refresh_token: refreshToken,
        client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        scope: "offline_access Calendars.Read",
      }),
      refreshToken
    ),
  busy: async (accessToken, from, to) => {
    const q = new URLSearchParams({ startDateTime: from, endDateTime: to, $select: "start,end,showAs", $top: "500" })
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    })
    if (!res.ok) throw new Error(`Microsoft calendarView failed (${res.status})`)
    const body = (await res.json()) as { value?: Array<{ start: { dateTime: string }; end: { dateTime: string }; showAs?: string }> }
    return (body.value ?? [])
      .filter((e) => e.showAs !== "free")
      .map((e) => ({ start: `${e.start.dateTime.replace(/\.\d+$/, "")}Z`, end: `${e.end.dateTime.replace(/\.\d+$/, "")}Z` }))
  },
}

export const PROVIDERS: Record<CalendarProvider, ProviderDef> = { google, microsoft }

export function isProvider(v: string): v is CalendarProvider {
  return v === "google" || v === "microsoft"
}
