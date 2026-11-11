/**
 * What the candidate pressed in the consent email — and the wall between that
 * and what they consented to.
 *
 * The consent ask sends two buttons, `?a=yes` and `?a=no`. They exist so the
 * page can say "you pressed record it, nothing is saved yet", which is the
 * difference between a link that feels broken and one that feels answered.
 *
 * AN INTENT IS NOT AN ANSWER, and this module exists to keep those two words
 * in separate types so they cannot be confused at a call site. A link in an
 * email may be followed by a mail client's prefetcher, a corporate link
 * scanner or a spam filter — none of which is the candidate. If `?a=yes` could
 * reach the consent record, or even pre-select the radio, a machine would have
 * answered a question that is the candidate's alone to answer.
 *
 * So `Intent` is deliberately NOT `ConsentDecision`: no value here is
 * assignable to one, and turning an intent into an answer requires a person
 * pressing save. A test scans the page for exactly that.
 *
 * Own module, no server imports, so it can be unit-tested and imported from a
 * client component without dragging anything into the browser bundle — the
 * settings-limits.ts / round-delta.ts pattern.
 */

/** What the person pressed in the email. Never a decision. */
export type Intent = "yes" | "no" | null

/**
 * Read the intent out of a query string.
 *
 * Anything that is not exactly `yes` or `no` is null — a truncated, doubled,
 * translated or hand-edited parameter produces no acknowledgement at all
 * rather than a guess, because an acknowledgement naming the wrong choice is
 * worse than none.
 *
 * @param search `window.location.search`, with or without its leading `?`.
 */
export function parseIntent(search: string): Intent {
  const a = new URLSearchParams(search).get("a")
  return a === "yes" || a === "no" ? a : null
}

/** The words for an intent, as the page says them back. Both read the same
 * way: neither answer is nudged, and the sentence that matters — that nothing
 * has been saved — is identical for both. */
export function intentPhrase(intent: Exclude<Intent, null>): string {
  return intent === "yes" ? "record it" : "do not record it"
}
