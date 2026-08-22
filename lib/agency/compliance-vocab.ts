/**
 * The right-to-work vocabulary, and the words the product uses for it.
 *
 * SEPARATE MODULE ON PURPOSE, for two reasons.
 *
 * 1. THE BUNDLE. lib/agency/compliance.ts imports agencyAdmin from ./db,
 *    which reaches next/headers and the service-role key. A client component
 *    importing a runtime CONSTANT from there drags all of that into the
 *    browser bundle and fails the build — types are erased and travel fine,
 *    constants are not and do not. Same pattern as settings-limits.ts and
 *    round-delta.ts.
 *
 * 2. THE DRIFT THAT CAUSED THIS. Before migration 27 the card component
 *    re-declared its own `type RtwStatus = "unverified" | ...` because it
 *    could not import the real one. When the server vocabulary changed, the
 *    card kept sending the old value and TypeScript said nothing — the two
 *    copies had no relationship to check. One definition, imported by both
 *    sides, is the fix.
 *
 * THE LANGUAGE IS LOAD-BEARING, NOT DECORATION.
 *
 * The agency is not the employer. For permanent placement the statutory
 * excuse and the civil penalty for illegal working belong to the client, and
 * nothing an agency records here gives the client that excuse. The old label
 * "Right to work verified" read as the statutory check, which invited a
 * recruiter to tell a client something false about their own liability. So
 * the evidence axis says SEEN, and EMPLOYER_CHECK_NOTICE below travels with
 * it everywhere it is rendered.
 *
 * And every label here describes an ACT or a REPORTED ANSWER, never a
 * property of a person. There is no "not eligible", on either axis, in any
 * wording — that is a conclusion about someone, conclusions belong to people,
 * and nothing in this product auto-rejects.
 */

/** What the agency has seen. A claim about an act somebody performed. */
export const RTW_EVIDENCE = ["not_checked", "seen"] as const
export type RtwEvidence = (typeof RTW_EVIDENCE)[number]

/** What the CANDIDATE said about needing sponsorship. Recorded by whoever
 * they said it to — not a conclusion the agency drew, and never an assessment
 * of anyone's immigration status. */
export const RTW_SPONSORSHIP = ["not_asked", "not_required", "required", "unsure"] as const
export type RtwSponsorship = (typeof RTW_SPONSORSHIP)[number]

export const EVIDENCE_LABEL: Record<RtwEvidence, string> = {
  not_checked: "Not checked yet",
  seen: "Evidence seen",
}

/** Attributed to the candidate in the words themselves, so the screen cannot
 * be misread as the agency ruling on somebody's status. */
export const SPONSORSHIP_LABEL: Record<RtwSponsorship, string> = {
  not_asked: "Not asked yet",
  not_required: "They say none needed",
  required: "They say it would be needed",
  unsure: "They are not sure",
}

/**
 * The sentence that must appear wherever right-to-work evidence is shown.
 *
 * This is the highest-value string in the feature. Do not soften it, do not
 * move it behind a tooltip, and do not delete it because the card looks busy.
 */
export const EMPLOYER_CHECK_NOTICE =
  "This is the agency's own pre-screen, not the employer's statutory check. " +
  "The employer must run its own check before employment starts."

/** Said once, where the answer is recorded, so nobody reads 'not sure' as a
 * problem with the person rather than a normal answer to a hard question. */
export const SPONSORSHIP_NOTICE =
  "What the candidate told you, in their words. It is not a decision about " +
  "them, it never filters or ranks anyone, and “not sure” is a legitimate answer."
