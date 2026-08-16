/**
 * Dates on records that have to hold up later.
 *
 * A consent event, an application, a tailored-CV save: these are stamped in
 * UTC and read back by someone who may be anywhere. Rendering them in the
 * viewer's local zone means a consent given at 23:40 UTC displays as the
 * NEXT day to a reader in Berlin and the SAME day to one in London — from
 * one row. On a surface whose whole purpose is "here is exactly what you
 * agreed to and when", the date must not depend on where it is read.
 *
 * So: fixed zone, explicit locale, one helper. UTC is the zone the value was
 * stored in, and labelling it is what makes it checkable against the audit
 * log rather than merely plausible.
 *
 * No server imports — client components use this.
 */

const DAY: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}

const DAY_TIME: Intl.DateTimeFormatOptions = {
  ...DAY,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "16 Aug 2026" — same string for every reader, everywhere. */
export function formatDay(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso)
  return d ? new Intl.DateTimeFormat("en-GB", DAY).format(d) : fallback
}

/** "16 Aug 2026, 14:22 UTC" — for the record surfaces, where the zone is
 *  part of the claim rather than decoration. */
export function formatMoment(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso)
  return d ? `${new Intl.DateTimeFormat("en-GB", DAY_TIME).format(d)} UTC` : fallback
}

/** "16 Aug" — the compact form for chips and inline mentions. */
export function formatDayShort(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso)
  return d
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d)
    : fallback
}
