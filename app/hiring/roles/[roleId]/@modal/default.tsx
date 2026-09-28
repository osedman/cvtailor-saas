/**
 * Nothing, which is the point.
 *
 * A parallel slot with no match renders this, so every hiring screen that is
 * not a room URL shows no modal. Without a default.tsx the slot 404s the whole
 * route on a hard navigation — the classic way this pattern breaks, and the
 * reason the agency side has had one since 14 Sep.
 */
export default function NoModal() {
  return null
}
