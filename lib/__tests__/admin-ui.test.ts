/**
 * Admin shell + the Admins / Activity / Two-step screens (13 Nov 2026).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { describeActivity, formatActivityTime } from "@/lib/admin-activity-text"

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf-8")

describe("activity wording", () => {
  const base = { area: "admins", actorName: "Amara Okoye", targetName: "Daniel Reyes" }

  it("reads as a sentence for each admin-list change", () => {
    expect(describeActivity({ ...base, action: "added", from: null, to: { role: "support" } }))
      .toBe("Amara Okoye added Daniel Reyes as Support")
    expect(describeActivity({ ...base, action: "role_changed", from: { role: "support" }, to: { role: "viewer" } }))
      .toBe("Amara Okoye changed Daniel Reyes from Support to Viewer")
    expect(describeActivity({ ...base, action: "removed", from: { role: "viewer" }, to: null }))
      .toBe("Amara Okoye removed Daniel Reyes")
  })

  it("an action it has no wording for is still legible", () => {
    expect(describeActivity({ area: "agencies", action: "member_suspended", actorName: "Amara Okoye", targetName: "Halcyon Search", from: null, to: null }))
      .toBe("Amara Okoye · member suspended · Halcyon Search")
  })

  it("malformed values never throw", () => {
    expect(describeActivity({ ...base, action: "role_changed", from: "x", to: 3 })).toContain("Amara Okoye")
    expect(describeActivity({ ...base, targetName: "", action: "removed", from: null, to: null })).toBe("Amara Okoye removed someone")
    expect(formatActivityTime("not a date")).toBe("")
  })
})

describe("admin shell", () => {
  const shell = read("components/admin/admin-shell.tsx")

  it("wraps every /admin page", () => {
    expect(read("app/admin/layout.tsx")).toContain("<AdminShell>{children}</AdminShell>")
  })

  it("takes its tabs from the server's answer, not an email list", () => {
    expect(shell).toContain('fetch("/api/admin/me"')
    expect(shell).toContain("roleAllows(me.role, t.needs)")
    expect(shell).not.toContain("isAdminEmail")
  })

  it("section levels in the nav match the routes behind them", () => {
    expect(shell).toMatch(/href: "\/admin\/courses"[^}]*needs: "admin"/)
    expect(shell).toMatch(/href: "\/admin\/admins"[^}]*needs: "admin"/)
    expect(shell).toMatch(/href: "\/admin\/activity"[^}]*needs: "support"/)
  })

  it("the admin area is not indexed", () => {
    expect(read("app/admin/layout.tsx")).toContain("index: false")
  })
})

describe("admins screen", () => {
  const page = read("app/admin/admins/page.tsx")

  it("every change carries a reason", () => {
    expect(page).toContain('send("POST", { email: email.trim(), role, reason })')
    expect(page).toContain('send("DELETE", { userId: person.userId, reason: pendingReason })')
    expect(page).toContain('send("PATCH", { userId: person.userId, role: pending.role, reason: pendingReason })')
  })

  it("controls are off without two-step, and the owner and yourself are never editable", () => {
    expect(page).toContain("disabled={!canWrite || busy}")
    expect(page).toContain('const editable = canWrite && p.source !== "owner" && !p.isYou')
  })
})

describe("two-step screen", () => {
  const page = read("app/admin/two-step/page.tsx")

  it("the return path cannot leave the site", () => {
    expect(page).toContain('safeNextPath(useSearchParams().get("next"))')
  })

  it("confirms with the server before saying it worked", () => {
    const verify = page.slice(page.indexOf("async function verify"))
    expect(verify.indexOf("await refresh()")).toBeGreaterThan(-1)
    expect(verify.indexOf("await refresh()")).toBeLessThan(verify.indexOf("toast.success"))
  })

  it("the setup key is not set in mono", () => {
    expect(page).not.toMatch(/font-mono|monospace/)
  })
})
