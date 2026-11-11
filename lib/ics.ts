/**
 * Minimal iCalendar (RFC 5545) generation for interview invitations.
 *
 * Hand-rolled rather than a dependency, because we emit exactly one shape of
 * event and the spec's sharp edges are few and well documented:
 *
 *   - **CRLF, always.** RFC 5545 §3.1 requires it. Calendar clients are the
 *     least forgiving consumers in the product; Outlook in particular will
 *     silently ignore a file with bare newlines rather than tell anybody.
 *   - **Lines fold at 75 octets**, continuing with a single leading space.
 *     Folding counts BYTES, not characters, so this folds on a byte buffer —
 *     splitting a multi-byte character across a fold produces a file that some
 *     clients reject and others render as mojibake.
 *   - **Escaping.** Backslash, semicolon, comma and newline are special inside
 *     a TEXT value. A role title containing a comma is not exotic.
 *   - **UTC only**, formatted as YYYYMMDDTHHMMSSZ, so no VTIMEZONE block is
 *     needed and no client has to agree with us about what "Europe/London"
 *     means in October.
 *
 * METHOD:PUBLISH, not REQUEST: this is an invitation to add something to your
 * own calendar, not an RSVP-able meeting request. The answering happens on the
 * booking doorway, where a decline can give the slot back — an email client's
 * Decline button cannot do that, and a candidate whose "no" went nowhere is
 * worse than no button at all.
 */

export interface CalendarEvent {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
  location?: string
  organiserName?: string
  /** Stamped by the caller so this stays a pure function. */
  now: Date
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** Escape a TEXT value per RFC 5545 §3.3.11. Order matters: backslash first. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/**
 * Fold one content line to 75 octets, continuation lines starting with a
 * space. Folds on bytes and never mid-character.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8")
  if (bytes.length <= 75) return line

  const out: string[] = []
  let cursor = 0
  let limit = 75
  while (cursor < bytes.length) {
    let take = Math.min(limit, bytes.length - cursor)
    // Walk back off a continuation byte so a character is never split.
    while (take > 0 && (bytes[cursor + take] & 0xc0) === 0x80) take -= 1
    if (take <= 0) take = Math.min(limit, bytes.length - cursor)
    out.push(bytes.subarray(cursor, cursor + take).toString("utf8"))
    cursor += take
    limit = 74 // subsequent lines lose one octet to the leading space
  }
  return out[0] + out.slice(1).map((l) => "\r\n " + l).join("")
}

export function buildIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tailr//Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(event.uid)}`,
    `DTSTAMP:${stamp(event.now)}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${esc(event.summary)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`)
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`)
  if (event.organiserName) lines.push(`ORGANIZER;CN=${esc(event.organiserName)}:MAILTO:noreply@invalid`)
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR")

  // CRLF between every line, and a trailing CRLF: some parsers drop the last
  // line without it.
  return lines.map(foldLine).join("\r\n") + "\r\n"
}
