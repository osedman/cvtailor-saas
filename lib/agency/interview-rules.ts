/**
 * The interview rules: the shape, the defaults, and the one validator.
 *
 * NO SERVER IMPORTS IN THIS FILE. The client's set-up screen renders these
 * defaults and coerces its own form state, and a runtime constant imported
 * from a module that reaches `agencyAdmin` drags next/headers and the
 * service-role key into the browser bundle and fails the build. That is
 * exactly what happened on 10 Sep 2026, and it is the same rule, and the
 * same reason, as phases.ts, settings-limits.ts and round-delta.ts.
 *
 * Persistence lives next door in interview-settings.ts, which imports this.
 *
 * Every bound here matches the check constraints in migration
 * 20260910090000, so a value that passes `normalise` cannot be rejected by
 * Postgres.
 */

export type LocationKind = "video" | "phone" | "in_person"
export type ReschedulePolicy = "none" | "until_notice" | "anytime"

export interface InterviewSettings {
  interviewType: string
  durationMinutes: number
  locationKind: LocationKind
  locationDetail: string
  windowFrom: string | null
  windowTo: string | null
  minNoticeHours: number
  bufferMinutes: number
  maxPerDay: number
  reschedulePolicy: ReschedulePolicy
  /** How many go out at once. Null invites everyone; the rest are the reserve. */
  waveSize: number | null
  /** How long a wave has to answer before the next is released. */
  waveReleaseHours: number
  /** How many times one candidate may move their own interview. */
  rescheduleLimit: number
}

export const DEFAULT_SETTINGS: InterviewSettings = {
  interviewType: "Hiring manager interview",
  durationMinutes: 45,
  locationKind: "video",
  locationDetail: "",
  windowFrom: null,
  windowTo: null,
  minNoticeHours: 24,
  bufferMinutes: 15,
  maxPerDay: 4,
  reschedulePolicy: "until_notice",
  waveSize: null,
  waveReleaseHours: 48,
  rescheduleLimit: 1,
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

const text = (v: unknown, max: number, fallback = ""): string =>
  typeof v === "string" ? v.trim().slice(0, max) : fallback

const day = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? v : null
}

/** Coerce anything into a valid settings object. Never throws. */
export function normalise(input: unknown): InterviewSettings {
  const raw = (input ?? {}) as Record<string, unknown>
  const kinds: LocationKind[] = ["video", "phone", "in_person"]
  const policies: ReschedulePolicy[] = ["none", "until_notice", "anytime"]
  let windowFrom = day(raw.windowFrom)
  let windowTo = day(raw.windowTo)
  // The column has the same check; ordering them here means a caller never
  // sees a constraint violation for something we could simply fix.
  if (windowFrom && windowTo && windowTo < windowFrom) [windowFrom, windowTo] = [windowTo, windowFrom]
  return {
    interviewType: text(raw.interviewType, 120, DEFAULT_SETTINGS.interviewType) || DEFAULT_SETTINGS.interviewType,
    durationMinutes: clamp(raw.durationMinutes, 5, 480, DEFAULT_SETTINGS.durationMinutes),
    locationKind: kinds.includes(raw.locationKind as LocationKind) ? (raw.locationKind as LocationKind) : DEFAULT_SETTINGS.locationKind,
    locationDetail: text(raw.locationDetail, 200),
    windowFrom,
    windowTo,
    minNoticeHours: clamp(raw.minNoticeHours, 0, 336, DEFAULT_SETTINGS.minNoticeHours),
    bufferMinutes: clamp(raw.bufferMinutes, 0, 240, DEFAULT_SETTINGS.bufferMinutes),
    maxPerDay: clamp(raw.maxPerDay, 1, 20, DEFAULT_SETTINGS.maxPerDay),
    reschedulePolicy: policies.includes(raw.reschedulePolicy as ReschedulePolicy)
      ? (raw.reschedulePolicy as ReschedulePolicy)
      : DEFAULT_SETTINGS.reschedulePolicy,
    // Null is meaningful here — it means "no waves, invite everyone" — so it
    // survives rather than falling back to a number.
    waveSize:
      raw.waveSize === null || raw.waveSize === undefined || raw.waveSize === ""
        ? null
        : clamp(raw.waveSize, 1, 50, 5),
    waveReleaseHours: clamp(raw.waveReleaseHours, 1, 336, DEFAULT_SETTINGS.waveReleaseHours),
    rescheduleLimit: clamp(raw.rescheduleLimit, 0, 10, DEFAULT_SETTINGS.rescheduleLimit),
  }
}
