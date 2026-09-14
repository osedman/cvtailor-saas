/**
 * Nothing, which is the point.
 *
 * A parallel slot with no match renders this, so every role screen that is
 * not a candidate URL shows no modal. Without a default.tsx the slot 404s the
 * whole route on a hard navigation, which is the classic way this pattern
 * breaks.
 */
export default function NoModal() {
  return null
}
