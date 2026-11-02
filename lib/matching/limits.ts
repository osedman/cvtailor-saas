/**
 * Bounds for the quiet-matching scan.
 *
 * SERVER-IMPORT-FREE ON PURPOSE. Client components show some of these numbers
 * ("we look at up to 200 people per scan", "you can rescan tomorrow"), and
 * anything importing a runtime constant from a module that imports
 * `agencyAdmin` drags `next/headers` and the service-role key into the browser
 * bundle and fails the build. Types erase and travel fine; constants do not.
 * `settings-limits.ts` and `round-delta.ts` are the same pattern.
 *
 * Every number here is a limit on OUR cost or OUR ability to probe. None of
 * them is a judgement about a person: nobody is rejected by any bound below,
 * and nobody is told anything about a scan they were not in.
 */

/**
 * Stage 1 keeps this many people for the expensive pass.
 *
 * A COST CAP, NOT A SOUNDNESS DEVICE. Someone who falls outside it has not
 * been assessed and certainly has not been rejected — they were not scored
 * this cycle. They are told nothing, because they never knew a scan was
 * happening. No decision about anyone has been made at this point.
 */
export const PREFILTER_KEEP = 200

/**
 * How far below the recruiter's threshold stage 1 still keeps someone.
 *
 * The prefilter is a keyword signal, not the real score — it is systematically
 * wrong in both directions. Cutting exactly at the threshold would drop people
 * the real pass would have accepted, so the band is deliberately generous.
 */
export const PREFILTER_SLACK = 15

/**
 * Minimum gap between scans of one role.
 *
 * THE ANTI-PROBING CONTROL, not a cost control. The recruiter sees a bucketed
 * count after a scan. Without a cooldown they could move the threshold, rescan,
 * and read the bucket changing — which over a few iterations says something
 * about individual people. A day between scans makes that useless.
 */
export const SCAN_COOLDOWN_HOURS = 24

/** Buckets, floored. A bucket of one must be indistinguishable from four. */
export const MATCH_BUCKETS = ["none", "fewer_than_5", "5_to_20", "over_20"] as const
export type MatchBucket = (typeof MATCH_BUCKETS)[number]

/**
 * The ONLY function that turns a count into something an agency may see.
 *
 * Zero is reported as `none` and that is honest — but note it is also what an
 * empty consumer pool returns, which is why the recruiter-facing copy must not
 * read as "nobody is qualified". It means "nobody we can show you".
 */
export function bucketOf(count: number): MatchBucket {
  if (count <= 0) return "none"
  if (count < 5) return "fewer_than_5"
  if (count <= 20) return "5_to_20"
  return "over_20"
}

/**
 * The wording each opt-in was agreed against.
 *
 * Stored on every consent event, so "when did I agree, and to what?" has an
 * answer that survives a copy rewrite. **Bump this whenever the settings copy
 * changes in a way that changes what is being agreed to** — not for a typo, but
 * for anything that alters the promise.
 */
// 2026-08-16: the apply sheet now names the tailored CV as what crosses when
// one exists ("exactly as you last saved it"), replacing the evidence-bank
// line — a change in what is being agreed to, hence the bump.
/**
 * Bumped 5 Sep 2026: the second promise ("the agency is told a rounded
 * count, never who") became conditional on a third switch, discoverable,
 * so anyone who agreed to the old wording is asked again.
 */
export const CONSENT_COPY_VERSION = "matching-2026-09-05"

/** The two opt-ins. Separate purposes; they revoke independently. */
export const CONSENT_SUBJECTS = ["matching", "enrichment", "discoverable"] as const
export type ConsentSubject = (typeof CONSENT_SUBJECTS)[number]

/** Score bounds a recruiter may set. Mirrors the DB check constraint. */
export const MIN_SCORE_FLOOR = 0
export const MIN_SCORE_CEILING = 100
export const MIN_SCORE_DEFAULT = 70
