/**
 * The next round number for a candidate on a role, and whether it reuses a
 * cancelled row.
 *
 * 21 Sep 2026. Round numbers were `highest + 1` with cancelled rows counted,
 * so a round-1 invitation the candidate declined (or the recruiter cancelled)
 * made the re-invitation "round 2" — and on a two-round plan the loop then
 * said "take to close-out" after one real interview. A cancelled round was
 * never held; its number is still owed.
 *
 * The unique key is (role_id, candidate_id, round_number) and a cancelled row
 * still holds its number, so the owed number is taken by REUSING that row
 * rather than inserting a second one (which is the 23505 the manual fix hit).
 * The cancellation itself stays in the audit log.
 *
 * Pure, so it is tested directly.
 */
export function nextRoundNumber(
  existing: Array<{ id: string; round_number: number; status: string }>
): { roundNumber: number; reuseId: string | null } {
  const held = existing.filter((r) => r.status !== "cancelled").map((r) => r.round_number)
  const roundNumber = (held.length ? Math.max(...held) : 0) + 1
  const cancelled = existing.find((r) => r.status === "cancelled" && r.round_number === roundNumber)
  return { roundNumber, reuseId: cancelled ? cancelled.id : null }
}
