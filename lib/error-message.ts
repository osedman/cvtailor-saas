/**
 * Turn anything thrown into a message a human can act on.
 *
 * `error instanceof Error ? error.message : String(error)` is the pattern this
 * replaces, and it is wrong in exactly the case that matters most here:
 * **Supabase errors are plain objects, not Error instances.** `{ message,
 * details, hint, code }` fails the instanceof check, falls through to
 * `String(error)`, and renders as the literal text `[object Object]` — which
 * is what a recruiter saw when publishing a role failed, with the real cause
 * (a stale PostgREST schema cache) nowhere on screen.
 *
 * No server imports: API routes, server modules and client components all need
 * this, and anything importing `agencyAdmin` drags `next/headers` and the
 * service-role key into the browser bundle.
 *
 * PII: Postgres messages can quote a row value, which on this schema can be an
 * email address. Callers that log rather than display should keep using the
 * name/code-only pattern in app/api/hiring/me/route.ts. This function is for
 * the message the ACTOR sees about their own failed action.
 */

interface MessageLike {
  message?: unknown
  code?: unknown
  details?: unknown
  hint?: unknown
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error && error.message) return error.message

  if (error && typeof error === "object") {
    const e = error as MessageLike
    const parts: string[] = []
    if (typeof e.message === "string" && e.message.trim()) parts.push(e.message.trim())
    // Supabase's details/hint usually carry the actionable half — "Could not
    // find the table ... in the schema cache" arrives as message, but the
    // hint is what tells you to reload it.
    if (typeof e.details === "string" && e.details.trim()) parts.push(e.details.trim())
    if (typeof e.hint === "string" && e.hint.trim()) parts.push(e.hint.trim())
    if (parts.length > 0) {
      const code = typeof e.code === "string" && e.code ? ` [${e.code}]` : ""
      return `${parts.join(" — ")}${code}`
    }
    // Last resort: never return "[object Object]". A JSON dump is ugly but it
    // is information, and this branch only runs when something threw a shape
    // nobody anticipated.
    try {
      const json = JSON.stringify(error)
      if (json && json !== "{}") return json
    } catch {
      /* circular or otherwise unserialisable */
    }
  }

  return "Something went wrong, and the error carried no message."
}
