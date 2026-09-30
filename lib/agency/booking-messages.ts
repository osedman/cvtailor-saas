/**
 * What the interview booking doorway says after the candidate acts.
 *
 * Two lies this replaces (28 Sep 2026):
 *
 *   - Choosing a time the previous person had just taken answered
 *     200 { ok: false, outcome: "not_open" } — listOpenWindows already hides a
 *     held window, so the claim finds nothing open rather than colliding — and
 *     the page only had words for "taken", so the choice silently vanished.
 *     "taken" (a unique-constraint race) only happens on a truly simultaneous
 *     click. Both mean the same thing to the person, and both get the same
 *     sentence; the list re-renders from the returned booking either way.
 *
 *   - A 429 from the rate limiter read as "That did not save", which invites
 *     an immediate retry that is refused again. It now says how long to wait.
 *
 * Load (GET) states live in doorway-messages.ts, shared with the consent and
 * reference doorways. Pure, so a test pins the mapping.
 */

import { waitPhrase } from "./doorway-messages"

export const TAKEN_MESSAGE =
  "That time has just been taken. The times below are the ones still free."

/** The window slid inside the notice cutoff while the page sat open. It was
 *  not taken by anyone, and saying so would be the 15 Sep lie again. */
export const TOO_SOON_MESSAGE =
  "That time is now too close to book. The times below are the ones you can still choose."

export const NOT_SAVED_MESSAGE = "That did not save. Please try again."

export function tooManyTriesMessage(retryAfter: number | null): string {
  return `Too many tries from your connection just now. Wait ${waitPhrase(retryAfter ?? 30)}, then choose again.`
}

/**
 * After choosing (or moving to) a window. `status` is null for a network
 * error. Returns the sentence to show, or null when there is nothing to say
 * (a claim that worked, or an outcome the re-rendered booking already
 * explains, such as already_booked).
 */
export function bookingChoiceMessage(input: {
  status: number | null
  outcome?: unknown
  retryAfter: number | null
}): string | null {
  const { status, outcome, retryAfter } = input
  if (status === null) return NOT_SAVED_MESSAGE
  if (status === 429) return tooManyTriesMessage(retryAfter)
  if (status >= 500) return NOT_SAVED_MESSAGE
  if (outcome === "too_soon") return TOO_SOON_MESSAGE
  if (outcome === "taken" || outcome === "not_open") return TAKEN_MESSAGE
  if (status >= 200 && status < 300) return null
  // 403 not_allowed (the booking it carries re-renders the reason) and any
  // other refusal keep the plain wording they always had.
  return NOT_SAVED_MESSAGE
}

/**
 * After confirming or declining a fixed time. Same 429 and 5xx wording as a
 * choice; any other refusal shows the server's own sentence, as before.
 */
export function bookingAnswerMessage(input: {
  status: number | null
  retryAfter: number | null
  error?: unknown
}): string | null {
  const { status, retryAfter, error } = input
  if (status === null) return NOT_SAVED_MESSAGE
  if (status === 429) return tooManyTriesMessage(retryAfter)
  if (status >= 500) return NOT_SAVED_MESSAGE
  if (status >= 200 && status < 300) return null
  return typeof error === "string" ? error : "Something went wrong."
}
