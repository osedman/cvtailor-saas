/** Emails allowed to access the admin dashboard */
export const ADMIN_EMAILS = ['o.oifoh@gmail.com']

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
