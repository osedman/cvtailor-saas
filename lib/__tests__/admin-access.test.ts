/**
 * Platform admins (12 Nov 2026): roles in the database, one gate, and an
 * append-only audit log. These pin the rules that decide who gets in and the
 * guarantees the migration makes.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { ADMIN_EMAILS, ADMIN_VIEWER_EMAILS } from "@/lib/admin"
import {
  checkAdminChange,
  isAdminRole,
  isAuditArea,
  resolveAdminRole,
  roleAllows,
  roleNeedsTwoStep,
} from "@/lib/admin-roles"

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf-8")
const OWNER = ADMIN_EMAILS[0]
const LEGACY_VIEWER = ADMIN_VIEWER_EMAILS[0]

describe("role levels", () => {
  it("each level includes the ones below it", () => {
    expect(roleAllows("admin", "admin")).toBe(true)
    expect(roleAllows("admin", "support")).toBe(true)
    expect(roleAllows("admin", "viewer")).toBe(true)
    expect(roleAllows("support", "viewer")).toBe(true)
    expect(roleAllows("support", "support")).toBe(true)
  })

  it("no level reaches above itself", () => {
    expect(roleAllows("viewer", "support")).toBe(false)
    expect(roleAllows("viewer", "admin")).toBe(false)
    expect(roleAllows("support", "admin")).toBe(false)
    expect(roleAllows(null, "viewer")).toBe(false)
    expect(roleAllows(undefined, "viewer")).toBe(false)
  })

  it("only real roles are roles", () => {
    expect(isAdminRole("support")).toBe(true)
    expect(isAdminRole("owner")).toBe(false)
    expect(isAdminRole("")).toBe(false)
    expect(isAdminRole(null)).toBe(false)
  })

  it("roles that can change things need two-step; viewers do not", () => {
    expect(roleNeedsTwoStep("viewer")).toBe(false)
    expect(roleNeedsTwoStep("support")).toBe(true)
    expect(roleNeedsTwoStep("admin")).toBe(true)
  })
})

describe("resolving a person's role", () => {
  it("a stranger has none", () => {
    expect(resolveAdminRole("stranger@example.com", null)).toBeNull()
    expect(resolveAdminRole(null, null)).toBeNull()
  })

  it("a database row grants its role", () => {
    expect(resolveAdminRole("someone@example.com", "support")).toBe("support")
    expect(resolveAdminRole("someone@example.com", "admin")).toBe("admin")
  })

  it("the owner is an admin whatever the table says — break-glass", () => {
    expect(resolveAdminRole(OWNER, null)).toBe("admin")
    expect(resolveAdminRole(OWNER, "viewer")).toBe("admin")
    expect(resolveAdminRole(OWNER.toUpperCase(), null)).toBe("admin")
  })

  it("a legacy viewer keeps viewing with no row, and a row can raise them", () => {
    expect(resolveAdminRole(LEGACY_VIEWER, null)).toBe("viewer")
    expect(resolveAdminRole(LEGACY_VIEWER, "support")).toBe("support")
  })

  it("an unreadable table (null) can only narrow access, never widen it", () => {
    // Same input the gate passes when the read fails: nobody gains a role.
    expect(resolveAdminRole("someone@example.com", null)).toBeNull()
  })
})

describe("who may change whom", () => {
  const base = { actorId: "a", targetId: "b", targetEmail: "b@example.com", nextRole: "support", reason: "covering onboarding" }

  it("a normal change is allowed", () => {
    expect(checkAdminChange(base)).toBeNull()
    expect(checkAdminChange({ ...base, nextRole: null })).toBeNull() // remove
  })

  it("a reason is mandatory", () => {
    expect(checkAdminChange({ ...base, reason: "" })).toBe("reason_required")
    expect(checkAdminChange({ ...base, reason: "  x " })).toBe("reason_required")
    expect(checkAdminChange({ ...base, reason: undefined })).toBe("reason_required")
  })

  it("the role must be a real one", () => {
    expect(checkAdminChange({ ...base, nextRole: "owner" })).toBe("invalid_role")
    expect(checkAdminChange({ ...base, nextRole: undefined })).toBe("invalid_role")
  })

  it("nobody changes their own access", () => {
    expect(checkAdminChange({ ...base, targetId: "a" })).toBe("cannot_change_self")
  })

  it("the owner account cannot be re-roled or removed", () => {
    expect(checkAdminChange({ ...base, targetEmail: OWNER })).toBe("owner_locked")
    expect(checkAdminChange({ ...base, targetEmail: OWNER, nextRole: null })).toBe("owner_locked")
  })
})

describe("audit areas", () => {
  it("accepts the four areas and nothing else", () => {
    for (const a of ["admins", "users", "agencies", "config"]) expect(isAuditArea(a)).toBe(true)
    expect(isAuditArea("everything")).toBe(false)
    expect(isAuditArea(null)).toBe(false)
  })
})

describe("the gate", () => {
  const src = read("lib/admin-access.ts")

  it("reads the assurance level from the verified session claims", () => {
    expect(src).toContain('claims.aal === "aal2"')
    expect(src).toContain("auth.getClaims()")
  })

  it("a failed table read falls back to null, not to a role", () => {
    expect(src).toMatch(/if \(error\) \{[\s\S]*?return null/)
    expect(src).toMatch(/catch \(e\) \{[\s\S]*?return null/)
  })

  it("answers a missing second factor distinctly from no access", () => {
    expect(src).toContain('"two_step_required"')
  })
})

describe("migration 20261112120000_platform_admins", () => {
  const sql = read("supabase/migrations/20261112120000_platform_admins.sql")

  it("both tables are closed to browsers", () => {
    for (const t of ["platform_admins", "admin_audit_log"]) {
      expect(sql).toContain(`alter table public.${t} enable row level security`)
      expect(sql).toContain(`revoke all on public.${t} from anon, authenticated`)
    }
    expect(sql).not.toMatch(/create policy/i)
  })

  it("the service role can write the admin list — a grant, not an assumption", () => {
    expect(sql).toContain("grant select, insert, update, delete on public.platform_admins to service_role")
  })

  it("the log is append-only even for the service role", () => {
    expect(sql).toContain("revoke all on public.admin_audit_log from service_role")
    expect(sql).toContain("grant select, insert on public.admin_audit_log to service_role")
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*admin_audit_log/i)
  })

  it("a reason is enforced by the table, not just the app", () => {
    expect(sql).toMatch(/reason\s+text not null check \(length\(btrim\(reason\)\) >= 3\)/)
  })

  it("the audit actor has no foreign key, so deleting an account keeps its history", () => {
    expect(sql).toMatch(/actor_id\s+uuid not null,/)
  })

  it("the change function is server-only, pinned, and logs in the same transaction", () => {
    expect(sql).toContain("security definer")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toMatch(/revoke execute on function public\.admin_set_platform_admin\(uuid, uuid, text, text\)\s+from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.admin_set_platform_admin\(uuid, uuid, text, text\)\s+to service_role/)
    const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"))
    expect(body).toContain("insert into public.admin_audit_log")
    expect(body).toContain("'cannot_change_self'")
    expect(body).toContain("'reason_required'")
  })

  it("no email address enters the migration — the repo is public", () => {
    expect(sql).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  })
})
