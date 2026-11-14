/**
 * One audit-log entry as a sentence a person can read.
 *
 * Pure, so the wording is tested rather than eyeballed. Unknown actions fall
 * back to a plain "actor · action · target" line: a new kind of entry must
 * still be legible before anyone remembers to add its wording here.
 */
import type { AdminRole } from "./admin-roles"

export interface ActivityEntry {
  id: number
  area: string
  action: string
  actorName: string
  targetType: string
  targetName: string
  from: unknown
  to: unknown
  reason: string
  at: string
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  viewer: "Viewer",
  support: "Support",
  admin: "Admin",
}

function roleOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const role = (value as { role?: unknown }).role
  if (typeof role !== "string") return null
  return ROLE_LABELS[role as AdminRole] ?? role
}

export function describeActivity(e: Pick<ActivityEntry, "area" | "action" | "actorName" | "targetName" | "from" | "to">): string {
  const target = e.targetName || "someone"
  if (e.area === "admins") {
    const from = roleOf(e.from)
    const to = roleOf(e.to)
    if (e.action === "added") return `${e.actorName} added ${target}${to ? ` as ${to}` : ""}`
    if (e.action === "role_changed" && from && to) return `${e.actorName} changed ${target} from ${from} to ${to}`
    if (e.action === "removed") return `${e.actorName} removed ${target}`
  }
  return `${e.actorName} · ${e.action.replace(/_/g, " ")} · ${target}`
}

export function formatActivityTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}
