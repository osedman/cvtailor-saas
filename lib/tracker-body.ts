/**
 * The tracker routes spread the request body into insert/update. Row
 * security keeps a row on its owner, but the body could still set the row's
 * id, its timestamps or its owner column (30 Sep 2026 access audit). The
 * server sets those; the client never does.
 */
const SERVER_OWNED = new Set(["id", "user_id", "created_at", "updated_at"])

export function withoutOwnership(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {}
  return Object.fromEntries(Object.entries(body as Record<string, unknown>).filter(([k]) => !SERVER_OWNED.has(k)))
}
