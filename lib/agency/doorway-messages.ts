/**
 * What a token doorway (booking, consent, reference) shows when loading it
 * did not simply work.
 *
 * Until 28 Sep 2026 every one of these pages read ANY non-OK answer as a dead
 * link. A 429 from the rate limiter — a second candidate on the same office
 * Wi-Fi — rendered "That link is not valid", which is false and tells the
 * person to give up on a link that was fine. The status codes mean different
 * things, and the page has to say different things:
 *
 *   404            the link really is dead           → the existing dead card
 *   429            busy for a moment                 → wait, retry on its own
 *   5xx / network  we failed, not the link           → offer "Try again"
 *
 * Pure and dependency-free so the client pages can import it and a test can
 * pin the mapping without rendering anything.
 */

export type DoorwayLoadState =
  | { kind: "dead" }
  | { kind: "busy"; title: string; body: string; retryInSeconds: number }
  | { kind: "retry"; title: string; body: string }

/** The longest a busy page waits before retrying on its own. The limiter's
 *  day bucket can answer with a Retry-After of hours; nobody watches a page
 *  count that down, and a retry costs one request. */
export const MAX_AUTO_RETRY_SECONDS = 60

/** When the server sends no usable Retry-After. */
const DEFAULT_RETRY_SECONDS = 30

/** Parse a Retry-After header given in seconds. Null when absent or not a
 *  number (the HTTP-date form is never sent by lib/rate-limit.ts). */
export function retryAfterSeconds(header: string | null | undefined): number | null {
  if (header == null || header.trim() === "") return null
  const n = Number(header)
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null
}

/** How long a busy page waits before retrying on its own: min(Retry-After, 60),
 *  never less than a second. */
export function autoRetryDelay(retryAfter: number | null): number {
  const n = retryAfter ?? DEFAULT_RETRY_SECONDS
  return Math.min(Math.max(1, n), MAX_AUTO_RETRY_SECONDS)
}

export function seconds(n: number): string {
  return n === 1 ? "1 second" : `${n} seconds`
}

/** A wait the reader can act on. Seconds while that is sensible; a day-bucket
 *  reset of 80,000 seconds reads as hours, not as a number to count. */
export function waitPhrase(n: number): string {
  const s = Math.max(1, Math.ceil(n))
  if (s <= 90) return seconds(s)
  if (s < 3600) {
    const m = Math.ceil(s / 60)
    return m === 1 ? "1 minute" : `${m} minutes`
  }
  const h = Math.ceil(s / 3600)
  return h === 1 ? "about an hour" : `about ${h} hours`
}

export const BUSY_TITLE = "This page is busy for a moment."

/** The busy card's body for `secondsLeft` on the countdown. */
export function busyBody(secondsLeft: number): string {
  const lead = "Several people on your connection are using Tailr right now."
  return secondsLeft > 0
    ? `${lead} It will try again in ${seconds(secondsLeft)}.`
    : `${lead} Trying again now…`
}

/**
 * Map a load (GET) answer to what the page shows. Returns null when the
 * response is OK and the page should render its content.
 *
 * `status` is null for a network error (fetch threw). `what` names the thing
 * that failed to load, e.g. "your interview".
 */
export function doorwayLoadState(input: {
  status: number | null
  retryAfter: number | null
  what?: string
}): DoorwayLoadState | null {
  const { status, retryAfter } = input
  const what = input.what ?? "this page"
  if (status !== null && status >= 200 && status < 300) return null
  if (status === 429) {
    const n = autoRetryDelay(retryAfter)
    return { kind: "busy", title: BUSY_TITLE, body: busyBody(n), retryInSeconds: n }
  }
  if (status === null || status >= 500) {
    return {
      kind: "retry",
      title: `We could not load ${what} just now.`,
      body: "This is usually brief. Please try again.",
    }
  }
  // 404 and any other refusal of the link itself.
  return { kind: "dead" }
}

/**
 * A doorway answer (consent) refused by its per-link write ceiling. It says
 * how long to wait, because "That did not save" invites an immediate retry
 * that is refused again.
 */
export function tooManyAnswersMessage(retryAfter: number | null): string {
  return `You have changed this a few times just now. Wait ${waitPhrase(retryAfter ?? 60)}, then save again.`
}
