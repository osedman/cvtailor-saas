/**
 * Admin support for consumer accounts — the pure rules (19 Nov 2026).
 * Safe to import from client components. Phase 2 of the admin area.
 *
 * What support can do to an account, and nothing else:
 *   reset_limits  clear the rate-limit counters (AI use and sign-in codes)
 *   reset_usage   set the tailor counter back to zero
 *   suspend       stop the account signing in
 *   reinstate     undo that
 *   unsubscribe   take the address off the mailing list
 *
 * Not here, on purpose: reading a CV or any content, changing an email
 * address, signing in as the person, and deleting the account (erasure has
 * its own path).
 */
import type { AdminRole } from "@/lib/admin-roles"

export const USER_ACTIONS = ["reset_limits", "reset_usage", "suspend", "reinstate", "unsubscribe"] as const
export type UserAction = (typeof USER_ACTIONS)[number]

export function isUserAction(v: unknown): v is UserAction {
  return typeof v === "string" && (USER_ACTIONS as readonly string[]).includes(v)
}

export const USER_ACTION_LABELS: Record<UserAction, string> = {
  reset_limits: "Reset limits",
  reset_usage: "Reset usage count",
  suspend: "Suspend account",
  reinstate: "Reinstate account",
  unsubscribe: "Remove from mailing list",
}

/** Supabase has no "forever"; this is 100 years. */
export const SUSPEND_DURATION = "876000h"

export function isSuspended(bannedUntil: string | null | undefined, now = Date.now()): boolean {
  return !!bannedUntil && new Date(bannedUntil).getTime() > now
}

export interface UserActionFacts {
  action: UserAction
  actorId: string
  targetId: string
  /** The target's own admin role, if they have one. */
  targetAdminRole: AdminRole | null
  suspended: boolean
  /** null = not on the mailing list at all. */
  subscribed: boolean | null
  tailorsUsed: number
  activeLimitCounters: number
}

/** Why an action cannot be taken, as the sentence to show — or null. */
export function userActionRefusal(f: UserActionFacts): string | null {
  switch (f.action) {
    case "suspend":
      if (f.actorId === f.targetId) return "You can't suspend your own account."
      // Suspending an admin would be a way round the Admins screen and its rules.
      if (f.targetAdminRole) return "This person has admin access. Remove that on the Admins screen first."
      if (f.suspended) return "This account is already suspended."
      return null
    case "reinstate":
      return f.suspended ? null : "This account is not suspended."
    case "unsubscribe":
      if (f.subscribed === null) return "This address is not on the mailing list."
      return f.subscribed ? null : "This address is already unsubscribed."
    case "reset_usage":
      return f.tailorsUsed > 0 ? null : "The usage count is already zero."
    case "reset_limits":
      return f.activeLimitCounters > 0 ? null : "There are no limit counters to reset."
  }
}

/** The search box: long enough that it cannot be used to page through everyone. */
export const USER_SEARCH_MIN = 3

export function cleanUserSearch(q: unknown): string | null {
  if (typeof q !== "string") return null
  // Strip PostgREST's or()/ilike delimiters before the term is interpolated.
  const term = q.replace(/[,()%*\\]/g, " ").trim().slice(0, 80)
  return term.length >= USER_SEARCH_MIN ? term : null
}
