/**
 * Admin roles — the pure rules, safe to import from client components.
 *
 * Three levels, each including the one below:
 *   viewer  — read the dashboards
 *   support — fix access, reset limits, manage agency members
 *   admin   — also create agencies, change configuration, manage admins
 *
 * Membership lives in public.platform_admins (migration
 * 20261112120000_platform_admins.sql). The lists in lib/admin.ts remain as a
 * floor that the table cannot lower: the owner address is always an admin
 * (break-glass — a missing or emptied table must not lock the owner out), and
 * the legacy viewer list still reads until those people have rows.
 *
 * The server-side gate that uses these is lib/admin-access.ts.
 */
import { isAdminEmail, isAdminViewer } from "./admin"

export const ADMIN_ROLES = ["viewer", "support", "admin"] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

const RANK: Record<AdminRole, number> = { viewer: 1, support: 2, admin: 3 }

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value)
}

/** Does holding `role` satisfy a route that needs `needed`? */
export function roleAllows(role: AdminRole | null | undefined, needed: AdminRole): boolean {
  return !!role && RANK[role] >= RANK[needed]
}

/**
 * The role a person actually holds. `dbRole` is their platform_admins row, or
 * null when they have none OR the table could not be read — both fall back to
 * the code lists, so a database problem can only ever narrow access.
 */
export function resolveAdminRole(
  email: string | null | undefined,
  dbRole: AdminRole | null | undefined
): AdminRole | null {
  if (isAdminEmail(email)) return "admin"
  if (dbRole) return dbRole
  if (isAdminViewer(email)) return "viewer"
  return null
}

/** Roles that can change things need two-step verification to do so. */
export function roleNeedsTwoStep(role: AdminRole): boolean {
  return role !== "viewer"
}

export const MIN_REASON_LENGTH = 3

export type AdminChangeRefusal =
  | "reason_required"
  | "invalid_role"
  | "cannot_change_self"
  | "owner_locked"

/**
 * Whether one admin may add, re-role or remove another. `nextRole` null means
 * remove. Mirrored by the checks inside admin_set_platform_admin(), which is
 * the backstop; this exists so the route can answer with a clear message.
 */
export function checkAdminChange(input: {
  actorId: string
  targetId: string
  targetEmail: string | null | undefined
  nextRole: unknown
  reason: unknown
}): AdminChangeRefusal | null {
  if (typeof input.reason !== "string" || input.reason.trim().length < MIN_REASON_LENGTH) {
    return "reason_required"
  }
  if (input.nextRole !== null && !isAdminRole(input.nextRole)) return "invalid_role"
  if (input.actorId === input.targetId) return "cannot_change_self"
  // The break-glass owner is an admin by code; a row could not change that,
  // so offering the edit would be a control that does nothing.
  if (isAdminEmail(input.targetEmail)) return "owner_locked"
  return null
}

export const ADMIN_CHANGE_MESSAGES: Record<AdminChangeRefusal, string> = {
  reason_required: "Give a short reason for this change.",
  invalid_role: "Choose Viewer, Support or Admin.",
  cannot_change_self: "You can't change your own access. Ask another admin.",
  owner_locked: "The owner account can't be changed or removed.",
}

export const AUDIT_AREAS = ["admins", "users", "agencies", "config"] as const
export type AuditArea = (typeof AUDIT_AREAS)[number]

export function isAuditArea(value: unknown): value is AuditArea {
  return typeof value === "string" && (AUDIT_AREAS as readonly string[]).includes(value)
}
