/**
 * Two levels of access to /admin.
 *
 * - ADMIN_EMAILS: full admin. The dashboard plus every admin API, including
 *   course review (approving what goes live) and course sync. Admin also
 *   implies career-path beta access — see lib/feature-gate.ts.
 * - ADMIN_VIEWER_EMAILS: read-only. Product health + insights/ops dashboards
 *   (aggregates, emails, activity). No course review, no sync, no market
 *   checks, and no beta implication. Use this for people who should watch the
 *   numbers without being able to change anything.
 */
export const ADMIN_EMAILS = ['o.oifoh@gmail.com']

export const ADMIN_VIEWER_EMAILS = ['oje.oifoh@gmail.com']

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}

/** Full admins are viewers too. Gate the stats dashboard on this; gate anything
 * that WRITES on isAdminEmail. */
export function isAdminViewer(email: string | undefined | null): boolean {
  if (isAdminEmail(email)) return true
  return !!email && ADMIN_VIEWER_EMAILS.includes(email.toLowerCase())
}
