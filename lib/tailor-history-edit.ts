/**
 * What a hand-edit of the tailored CV does to tailor_history.result — pure,
 * so the rule is testable on values rather than by grepping the route.
 *
 *   - the AI's original is stashed once, on the first edit only;
 *   - result.roleMatch is dropped: the after-tailoring score described the
 *     bytes that were just replaced (lib/matching/role-match.ts). /found falls
 *     back to the before number; re-running tailor from the role (a free
 *     cache hit) re-scores the edited text;
 *   - result.tailoredCVEditedAt is stamped. This is the CV-specific edit
 *     signal /found and the tailor route compare against roleMatch.assessedAt.
 *     It is deliberately NOT the row's edited_at, which a cover-letter edit
 *     also sets — a cover-letter edit does not change the document the after
 *     number describes and must not hide it.
 */
export function applyTailoredCvEdit(
  result: Record<string, unknown>,
  tailoredCV: string,
  now: Date = new Date()
): Record<string, unknown> {
  const { roleMatch: _staleRoleMatch, ...rest } = result
  return {
    ...rest,
    tailoredCVOriginal: result.tailoredCVOriginal ?? result.tailoredCV,
    tailoredCV,
    tailoredCVEditedAt: now.toISOString(),
  }
}
