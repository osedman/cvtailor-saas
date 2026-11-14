/**
 * The one gate every admin route goes through (12 Nov 2026).
 *
 * Before this, each /api/admin route did its own email check against the
 * lists in lib/admin.ts. requireAdmin() replaces those: it reads the session,
 * resolves the person's role (lib/admin-roles.ts) and answers with either the
 * admin or the response to return.
 *
 *   const gate = await requireAdmin("support", { twoStep: true })
 *   if (!gate.ok) return gate.response
 *
 * `twoStep: true` additionally requires the session to have passed a second
 * factor (Supabase assurance level aal2). Every route that CHANGES something
 * for another person or tenant passes it; the setup screen is
 * /admin/two-step.
 *
 * Server-only: it uses the service-role client.
 */
import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isAdminRole, resolveAdminRole, roleAllows, type AdminRole } from "@/lib/admin-roles"

export interface AdminIdentity {
  userId: string
  email: string | null
  role: AdminRole
  /** True when this session has passed two-step verification. */
  twoStep: boolean
}

export type AdminGate =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; response: NextResponse }

/** Body for "signed in as an admin, but this session hasn't done two-step". */
export const TWO_STEP_REQUIRED = { error: "two_step_required" } as const

/** A person's platform_admins role, or null (no row, or the table unreadable). */
export async function readDbRole(userId: string): Promise<AdminRole | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("platform_admins")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle()
    if (error) {
      // Most likely the migration has not run here yet. Falling back to the
      // code lists can only narrow access, never widen it.
      console.error("[admin-access] platform_admins read failed:", error.message)
      return null
    }
    return isAdminRole(data?.role) ? data.role : null
  } catch (e) {
    console.error("[admin-access] platform_admins read threw:", e)
    return null
  }
}

/** The signed-in admin, or null. No level check — see requireAdmin for that. */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return null
  const email = typeof claims.email === "string" ? claims.email : null
  const role = resolveAdminRole(email, await readDbRole(claims.sub))
  if (!role) return null
  return { userId: claims.sub, email, role, twoStep: claims.aal === "aal2" }
}

export async function requireAdmin(
  needed: AdminRole,
  opts: { twoStep?: boolean } = {}
): Promise<AdminGate> {
  const admin = await currentAdmin()
  if (!admin || !roleAllows(admin.role, needed)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  if (opts.twoStep && !admin.twoStep) {
    return { ok: false, response: NextResponse.json(TWO_STEP_REQUIRED, { status: 403 }) }
  }
  return { ok: true, admin }
}
