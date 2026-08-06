/** Emails allowed to access the admin dashboard.
 * Admin also implies career-path beta access — see lib/feature-gate.ts. */
export const ADMIN_EMAILS = ['o.oifoh@gmail.com', 'oje.oifoh@gmail.com']

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
