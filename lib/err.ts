/** Human-readable message from any thrown value. Supabase/Postgrest errors are
 * plain objects (not Error instances), so String(err) renders "[object Object]"
 * — this unwraps their message/details instead. */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: string; error?: string; details?: string; hint?: string; code?: string }
    return e.message || e.error || e.details || e.hint || (e.code ? `Database error ${e.code}` : JSON.stringify(err))
  }
  return String(err)
}
