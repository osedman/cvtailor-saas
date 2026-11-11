/**
 * What the hiring-manager invite page says when accepting was refused by the
 * rate limiter.
 *
 * Until 28 Sep 2026 /api/hiring/accept charged a per-network limit at the
 * sign-in tier, three a minute, and the page printed the limiter's generic
 * sentence. The route now uses the doorway limit (per link, plus a loose
 * network ceiling), so a 429 here is rare — but when it happens the reader
 * needs to know it is temporary and how long to wait, not to try again at
 * once and be refused again.
 *
 * Loading the invite reuses lib/agency/doorway-messages.ts as it is
 * (doorwayLoadState: 404 dead, 429 busy, 5xx retry); only the accept answer
 * needs its own words. Pure, so a test can pin the sentence.
 */

import { waitPhrase } from "./doorway-messages"

/** A 429 on accept. `retryAfter` is the Retry-After header in seconds. */
export function tooManyAcceptsMessage(retryAfter: number | null): string {
  // Not "from your connection": this refusal can come from the per-account
  // or per-link limit as well as the network ceiling.
  return `Too many tries just now. Wait ${waitPhrase(retryAfter ?? 60)}, then accept again.`
}
