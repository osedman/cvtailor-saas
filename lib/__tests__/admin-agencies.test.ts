/**
 * Admin operations on agencies (14 Nov 2026): create an agency with its
 * first owner, fix team access, change settings — each one audited twice.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  agencyAccessEmail,
  agencyRpcError,
  isUuid,
  normaliseEmail,
  parseAgencySettings,
  parseNewAgency,
  slugifyAgencyName,
} from "@/lib/admin-agencies"
import { describeActivity } from "@/lib/admin-activity-text"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf-8")

describe("short names", () => {
  it("makes a clean slug from a real agency name", () => {
    expect(slugifyAgencyName("Halcyon Search Ltd.")).toBe("halcyon-search-ltd")
    expect(slugifyAgencyName("  Ørsted & Sons — Zürich  ")).toBe("orsted-and-sons-zurich")
    expect(slugifyAgencyName("A".repeat(90))).toHaveLength(60)
    expect(slugifyAgencyName("x".repeat(59) + " y")).not.toMatch(/-$/)
  })
})

describe("creating an agency", () => {
  const ok = { name: "Halcyon Search", ownerEmail: " Owner@Example.com ", reason: "new customer" }

  it("accepts a normal request and derives the short name", () => {
    expect(parseNewAgency(ok)).toEqual({
      name: "Halcyon Search", slug: "halcyon-search", ownerEmail: "owner@example.com", reason: "new customer",
    })
  })

  it("refuses each missing or malformed part with its own sentence", () => {
    expect(parseNewAgency(null)).toHaveProperty("error")
    expect(parseNewAgency({ ...ok, name: "X" })).toHaveProperty("error")
    expect(parseNewAgency({ ...ok, slug: "Not A Slug!" })).toHaveProperty("error")
    expect(parseNewAgency({ ...ok, ownerEmail: "not-an-email" })).toHaveProperty("error")
    expect(parseNewAgency({ ...ok, reason: " " })).toEqual({ error: "Give a short reason for this change." })
  })
})

describe("agency settings", () => {
  it("only sends what was asked to change", () => {
    expect(parseAgencySettings({ retentionDays: "365", reason: "their policy" })).toEqual({
      name: null, retentionDays: 365, noticeDelayDays: null, reason: "their policy",
    })
  })

  it("holds the same bounds as the owner-facing screen, and the notice cap", () => {
    expect(parseAgencySettings({ retentionDays: 0, reason: "x y z" })).toHaveProperty("error")
    expect(parseAgencySettings({ retentionDays: 3651, reason: "x y z" })).toHaveProperty("error")
    expect(parseAgencySettings({ retentionDays: 1.5, reason: "x y z" })).toHaveProperty("error")
    expect(parseAgencySettings({ noticeDelayDays: 29, reason: "x y z" })).toHaveProperty("error")
    expect(parseAgencySettings({ noticeDelayDays: 28, reason: "x y z" })).not.toHaveProperty("error")
  })

  it("needs something to change and a reason", () => {
    expect(parseAgencySettings({ reason: "nothing here" })).toEqual({ error: "Nothing to change." })
    expect(parseAgencySettings({ retentionDays: 90 })).toHaveProperty("error")
  })
})

describe("inputs", () => {
  it("emails are trimmed, lowercased and checked", () => {
    expect(normaliseEmail(" A@B.co ")).toBe("a@b.co")
    expect(normaliseEmail("a b@c.co")).toBeNull()
    expect(normaliseEmail(42)).toBeNull()
  })

  it("ids must be uuids before they reach a query", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true)
    expect(isUuid("1 or 1=1")).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})

describe("database refusals read as sentences", () => {
  it("maps each raised code", () => {
    expect(agencyRpcError("last_owner")?.status).toBe(409)
    expect(agencyRpcError("ERROR: slug_taken")?.message).toMatch(/short name/)
    expect(agencyRpcError("invalid_retention")?.message).toMatch(/Retention/)
    expect(agencyRpcError("connection reset")).toBeNull()
    expect(agencyRpcError(null)).toBeNull()
  })
})

describe("the access email", () => {
  it("escapes the agency name and uses the right article", () => {
    const mail = agencyAccessEmail({ agencyName: "<b>Halcyon</b> & Co", role: "owner", signInUrl: "https://x.test/login", isInvite: false })
    expect(mail.html).toContain("&lt;b&gt;Halcyon&lt;/b&gt; &amp; Co as an owner")
    expect(mail.html).not.toContain("<b>Halcyon")
    expect(agencyAccessEmail({ agencyName: "A", role: "recruiter", signInUrl: "u", isInvite: true }).html)
      .toContain("as a recruiter")
  })
})

describe("activity wording for agencies", () => {
  const base = { area: "agencies", actorName: "Amara Okoye", targetName: "Halcyon Search", subjectName: "Daniel Reyes" }

  it("reads as a sentence for each operation", () => {
    expect(describeActivity({ ...base, action: "agency_created", from: null, to: { name: "Halcyon Search" } }))
      .toBe("Amara Okoye created Halcyon Search with Daniel Reyes as owner")
    expect(describeActivity({ ...base, action: "member_invited", from: {}, to: { role: "owner", status: "active" } }))
      .toBe("Amara Okoye added Daniel Reyes to Halcyon Search as Owner")
    expect(describeActivity({ ...base, action: "member_changed", from: { role: "owner", status: "active" }, to: { role: "recruiter", status: "active" } }))
      .toBe("Amara Okoye changed Daniel Reyes at Halcyon Search from Owner to Recruiter")
    expect(describeActivity({ ...base, action: "member_suspended", from: { role: "recruiter", status: "active" }, to: { role: "recruiter", status: "suspended" } }))
      .toBe("Amara Okoye suspended Daniel Reyes at Halcyon Search")
    expect(describeActivity({ ...base, action: "member_changed", from: { role: "recruiter", status: "suspended" }, to: { role: "recruiter", status: "active" } }))
      .toBe("Amara Okoye reactivated Daniel Reyes at Halcyon Search")
  })

  it("says what changed in the settings, with the old value", () => {
    expect(describeActivity({
      ...base, subjectName: null, action: "settings_changed",
      from: { name: "Halcyon Search", retention_days: 180, notice_delay_days: 7 },
      to: { name: "Halcyon Search", retention_days: 365, notice_delay_days: 14 },
    })).toBe("Amara Okoye changed Halcyon Search: retention 180 to 365 days, notice delay 7 to 14 days")
  })
})

describe("the routes", () => {
  const list = read("app/api/admin/agencies/route.ts")
  const one = read("app/api/admin/agencies/[id]/route.ts")
  const members = read("app/api/admin/agencies/[id]/members/route.ts")

  it("every write needs two-step verification; reads do not", () => {
    for (const src of [list, one]) {
      expect(src).toContain('requireAdmin("support")')
      expect(src).toContain('requireAdmin("admin", { twoStep: true })')
    }
    expect(members.match(/requireAdmin\("support", \{ twoStep: true \}\)/g)?.length).toBe(2)
    expect(members).not.toContain('requireAdmin("support")')
  })

  it("writes go through the audited database functions, never a bare update", () => {
    expect(list).toContain('admin.rpc("admin_create_agency"')
    expect(one).toContain('admin.rpc("admin_update_agency_settings"')
    expect(members).toContain('admin.rpc("admin_set_agency_member"')
    for (const src of [list, one, members]) {
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    }
  })

  it("a member cannot be deleted from here — suspension only", () => {
    expect(members).not.toMatch(/export const DELETE/)
  })

  it("the agency view carries no candidate or CV data", () => {
    // Code only — the route's own comment says what it leaves out.
    expect(tsCode(one)).not.toMatch(/candidates|jd_raw|recruiter_notes|evidence|submissions/)
    expect(one).toContain('.select("id, ref, title, company, status, created_at")')
  })

  it("a short-name clash is caught before an account is created for the owner", () => {
    expect(list.indexOf('.eq("slug", input.slug)')).toBeLessThan(list.indexOf("resolveOrInviteAccount(input.ownerEmail)"))
  })

  it("the activity log never sends a member's id, only their name", () => {
    const activity = read("app/api/admin/activity/route.ts")
    expect(activity).toContain("from: strip(r.from_value)")
    expect(activity).toContain("to: strip(r.to_value)")
  })
})

describe("migration 20261114120000_admin_agency_ops", () => {
  const sql = read("supabase/migrations/20261114120000_admin_agency_ops.sql")
  const fns = [
    "admin_create_agency(uuid, text, text, uuid, text)",
    "admin_set_agency_member(uuid, uuid, uuid, text, text, text)",
    "admin_update_agency_settings(uuid, uuid, text, integer, integer, text)",
  ]

  it("all three functions are server-only and pinned", () => {
    for (const fn of fns) {
      expect(sql).toContain(`revoke execute on function public.${fn}\n  from public, anon, authenticated`)
      expect(sql).toContain(`grant execute on function public.${fn}\n  to service_role`)
    }
    expect(sql.match(/security definer/g)?.length).toBe(3)
    expect(sql.match(/set search_path = ''/g)?.length).toBe(3)
  })

  it("each one writes both audit logs", () => {
    expect(sql.match(/insert into agency\.audit_log/g)?.length).toBe(3)
    expect(sql.match(/insert into public\.admin_audit_log/g)?.length).toBe(3)
  })

  it("an agency can never be left without an active owner", () => {
    expect(sql).toContain("raise exception 'last_owner'")
    expect(sql).toMatch(/role = 'owner' and status = 'active'/)
  })

  it("nothing here deletes anything or touches roles and candidates", () => {
    const code = sql.replace(/--.*$/gm, "")
    expect(code).not.toMatch(/\bdelete from\b/i)
    expect(code).not.toMatch(/job_roles|candidates/)
  })

  it("no email address enters the migration — the repo is public", () => {
    expect(sql).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  })
})

describe("the agency screens", () => {
  const list = read("app/admin/agencies/page.tsx")
  const one = read("app/admin/agencies/[id]/page.tsx")

  it("the nav offers Agencies at the level the list route allows", () => {
    expect(read("components/admin/admin-shell.tsx")).toMatch(/href: "\/admin\/agencies"[^}]*needs: "support"/)
  })

  it("only an admin is shown the create form or editable settings", () => {
    expect(list).toContain('const canCreate = roleAllows(me.role, "admin")')
    expect(list).toContain("{canCreate && (")
    expect(one).toContain('const canEditSettings = roleAllows(me.role, "admin")')
  })

  it("every change sends a reason", () => {
    expect(list).toContain("ownerEmail, reason })")
    expect(one).toContain("{ ...patch, reason: settingsReason }")
    expect(one).toContain("role, reason: addReason }")
    expect(one).toContain("role: pending.role, reason: pendingReason }")
    expect(one).toContain("status: pending.status, reason: pendingReason }")
  })

  it("says so when the owner or member was not actually emailed", () => {
    expect(list).toContain("was not sent")
    expect(one).toContain("the email was not sent")
  })

  it("offers no way to delete a member, or to close or discard a role", () => {
    for (const src of [tsCode(list), tsCode(one)]) {
      expect(src).not.toMatch(/method: "DELETE"|"DELETE"/)
      expect(src).not.toMatch(/Close role|Discard|Remove member|Delete/)
    }
  })

  it("uses the admin styles and no mono", () => {
    for (const src of [list, one]) {
      expect(src).toContain("ns-admin-card")
      expect(src).not.toMatch(/font-mono|monospace/)
    }
  })
})

describe("the agency's own audit page", () => {
  it("names support changes as Tailr support, not a teammate or the system", () => {
    const view = read("lib/agency/audit-view.ts")
    expect(view).toContain('reason.startsWith("Tailr support:")')
    expect(view).toContain('label: "Tailr support"')
  })
})
