/**
 * Revoking a hiring manager's shortlist ends their access to that role —
 * every door, not only the shortlist (Ose, 30 Sep 2026: "revoking should cut
 * access").
 *
 * Before this, only the submission-recipient tie honoured `revoked_at`. A
 * contact who was also the role's named contact, or who sat on a round,
 * kept the header, the live shortlist, wave release, interview settings,
 * round decisions and debriefs through those other ties.
 *
 * A (role, contact) pair is CUT when the contact received the shortlist for
 * that role and every one of those recipient rows is revoked. A later send
 * to them writes a new live row, which restores access — re-sending is how
 * a recruiter undoes a revoke.
 */
import { agencyAdmin, AgencyAccessError } from "./db"

const key = (roleId: string, contactId: string) => `${roleId}:${contactId}`

/** Every cut (role, contact) pair among these contacts, as `roleId:contactId`. */
export async function revokedPairs(contactIds: string[]): Promise<Set<string>> {
  const cut = new Set<string>()
  if (contactIds.length === 0) return cut
  const { data, error } = await agencyAdmin()
    .from("submission_recipients")
    .select("contact_id, revoked_at, submissions!inner(role_id)")
    .in("contact_id", contactIds)
  if (error) throw error
  const live = new Set<string>()
  const revoked = new Set<string>()
  for (const r of data ?? []) {
    const sub = (r as { submissions?: { role_id?: string } | { role_id?: string }[] }).submissions
    const roleId = Array.isArray(sub) ? sub[0]?.role_id : sub?.role_id
    if (!roleId) continue
    const k = key(roleId, r.contact_id as string)
    if (r.revoked_at) revoked.add(k)
    else live.add(k)
  }
  for (const k of revoked) if (!live.has(k)) cut.add(k)
  return cut
}

export function isCut(cut: Set<string>, roleId: string | null | undefined, contactId: string | null | undefined): boolean {
  return Boolean(roleId && contactId && cut.has(key(roleId, contactId)))
}

/** Throws when this contact's access to this role was revoked. */
export async function assertNotRevoked(roleId: string | null | undefined, contactId: string | null | undefined): Promise<void> {
  if (!roleId || !contactId) return
  const cut = await revokedPairs([contactId])
  if (isCut(cut, roleId, contactId)) throw new AgencyAccessError("your access to this role was withdrawn")
}
