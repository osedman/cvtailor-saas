/**
 * Where AGENCY mail is sent from (29 Sep 2026).
 *
 * Its own module, not lib/email.ts: a dozen tests mock "@/lib/email" with
 * sendEmail alone, and a sender helper hidden in that mock is undefined.
 *
 * Tailr for Agencies has its own domain (tailrecruit.com, bought 29 Sep) so an
 * agency's candidates and clients never get mail from the consumer brand —
 * the separation the domain was bought for (docs/DOMAINS.md). The domain is
 * config, not code: B2B_MAIL_DOMAIN, set per environment ONLY once that
 * domain is verified in Resend. Unset, everything sends from gettailr.com
 * exactly as before — a sender on an unverified domain is refused by Resend,
 * so defaulting to the new one would stop all agency mail.
 */
export function b2bMailDomain(): string {
  const raw = (process.env.B2B_MAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "")
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw) ? raw : "gettailr.com"
}

/** Product mail from Tailr for Agencies itself: sign-in, team and client invites, notifications. */
export function b2bFrom(): string {
  return `Tailr for Agencies <hello@${b2bMailDomain()}>`
}

/** Mail sent on an agency's behalf (notices, bookings, references, closure). */
export function agencyNoticeFrom(agencyName: string): string {
  // Display names are quoted by Resend's parser only when needed; strip the
  // characters that would break the header rather than trust an agency name.
  const name = (agencyName || "Your recruiter").replace(/[<>"\r\n]/g, "").trim() || "Your recruiter"
  return `${name} via Tailr <notices@${b2bMailDomain()}>`
}
