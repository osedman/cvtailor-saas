/**
 * Admin area Phase 2 (19 Nov 2026): support for consumer accounts.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { cleanUserSearch, isSuspended, isUserAction, userActionRefusal, type UserActionFacts } from "@/lib/admin-users"
import { describeActivity } from "@/lib/admin-activity-text"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf-8")
const facts = (over: Partial<UserActionFacts>): UserActionFacts => ({
  action: "reset_limits", actorId: "a", targetId: "b", targetAdminRole: null,
  suspended: false, subscribed: true, tailorsUsed: 5, activeLimitCounters: 2, ...over,
})

describe("what support may do to an account", () => {
  it("each action is allowed when it applies", () => {
    expect(userActionRefusal(facts({ action: "reset_limits" }))).toBeNull()
    expect(userActionRefusal(facts({ action: "reset_usage" }))).toBeNull()
    expect(userActionRefusal(facts({ action: "suspend" }))).toBeNull()
    expect(userActionRefusal(facts({ action: "reinstate", suspended: true }))).toBeNull()
    expect(userActionRefusal(facts({ action: "unsubscribe" }))).toBeNull()
  })

  it("an admin cannot be suspended from here, and nobody suspends themselves", () => {
    for (const role of ["viewer", "support", "admin"] as const) {
      expect(userActionRefusal(facts({ action: "suspend", targetAdminRole: role }))).toMatch(/admin access/)
    }
    expect(userActionRefusal(facts({ action: "suspend", targetId: "a" }))).toMatch(/your own/)
  })

  it("an action that would change nothing is refused, not logged as done", () => {
    expect(userActionRefusal(facts({ action: "suspend", suspended: true }))).toMatch(/already suspended/)
    expect(userActionRefusal(facts({ action: "reinstate" }))).toMatch(/not suspended/)
    expect(userActionRefusal(facts({ action: "unsubscribe", subscribed: false }))).toMatch(/already unsubscribed/)
    expect(userActionRefusal(facts({ action: "unsubscribe", subscribed: null }))).toMatch(/not on the mailing list/)
    expect(userActionRefusal(facts({ action: "reset_usage", tailorsUsed: 0 }))).toMatch(/already zero/)
    expect(userActionRefusal(facts({ action: "reset_limits", activeLimitCounters: 0 }))).toMatch(/no limit counters/)
  })

  it("only the five actions exist — no delete, no impersonation, no email change", () => {
    for (const a of ["reset_limits", "reset_usage", "suspend", "reinstate", "unsubscribe"]) expect(isUserAction(a)).toBe(true)
    for (const a of ["delete", "impersonate", "change_email", "set_plan", ""]) expect(isUserAction(a)).toBe(false)
  })

  it("suspension is read from the ban's end time", () => {
    const now = Date.parse("2026-11-19T12:00:00Z")
    expect(isSuspended("2126-01-01T00:00:00Z", now)).toBe(true)
    expect(isSuspended("2026-11-19T11:00:00Z", now)).toBe(false)
    expect(isSuspended(null, now)).toBe(false)
  })
})

describe("the search", () => {
  it("needs three characters, so it cannot page through everyone", () => {
    expect(cleanUserSearch("da")).toBeNull()
    expect(cleanUserSearch("  d  ")).toBeNull()
    expect(cleanUserSearch(undefined)).toBeNull()
    expect(cleanUserSearch(" dan ")).toBe("dan")
  })

  it("cannot smuggle filter syntax into the query", () => {
    expect(cleanUserSearch("a%,id.neq.0)")).toBe("a  id.neq.0")
    expect(cleanUserSearch("%%%")).toBeNull()
  })

  it("the route caps results and refuses a short term", () => {
    const src = tsCode(read("app/api/admin/users/route.ts"))
    expect(src).toContain("const LIMIT = 20")
    expect(src).toContain("if (!term)")
    expect(src).toContain('.select("id, email, full_name, plan, created_at")')
  })
})

describe("the account route", () => {
  const src = read("app/api/admin/users/[id]/route.ts")
  const code = tsCode(src)

  it("reading is support; changing needs two-step", () => {
    expect(src).toContain('requireAdmin("support")')
    expect(src).toContain('requireAdmin("support", { twoStep: true })')
  })

  it("never selects content: no CV, job text, tailored output, IP or user agent", () => {
    expect(code).not.toMatch(/original_cv|tailored|job_description|cover_letter|user_agent|\bip\b/)
    // History and tracker are counted, never read.
    expect(code).toContain('select("*", { count: "exact", head: true })')
    expect(code).toContain('.from("login_events").select("created_at")')
  })

  it("checks the action with the same rule the screen uses, before doing anything", () => {
    expect(code.indexOf("userActionRefusal(")).toBeGreaterThan(-1)
    expect(code.indexOf("userActionRefusal(")).toBeLessThan(code.indexOf('.from("rate_limits").delete()'))
  })

  it("verifies each change by reading it back, then logs it", () => {
    expect(code.match(/throw failed\(\)/g)?.length).toBe(4)
    expect(code.match(/await log\(/g)?.length).toBe(4)
  })

  it("clears sign-in counters for both doors, keyed as the sign-in route keys them", () => {
    expect(code).toContain('for (const door of ["consumer", "business"]) ids.push(anonRateLimitId(`email:${door}:${email}`))')
    expect(read("app/api/auth/request-otp/route.ts")).toContain("anonRateLimitId(`email:${door}:${email}`)")
  })

  it("only ever deletes rate-limit counters — never an account or its data", () => {
    const deletes = [...code.matchAll(/\.from\("(\w+)"\)\.delete\(\)/g)].map((m) => m[1])
    expect(deletes).toEqual(["rate_limits"])
    expect(code).not.toMatch(/deleteUser/)
  })

  it("has no way to change an email address or sign in as the person", () => {
    expect(code).not.toMatch(/generateLink|signInWith|email:\s*body|updateUserById\(id, \{\s*email/)
  })
})

describe("activity wording for accounts", () => {
  const base = { area: "users", actorName: "Amara Okoye", targetName: "Daniel Reyes", to: null }

  it("reads as a sentence for each action", () => {
    expect(describeActivity({ ...base, action: "limits_reset", from: { counters: 3 } })).toBe("Amara Okoye reset the limits for Daniel Reyes")
    expect(describeActivity({ ...base, action: "usage_reset", from: { tailors_used: 42 } })).toBe("Amara Okoye reset the usage count for Daniel Reyes (was 42)")
    expect(describeActivity({ ...base, action: "suspended", from: null })).toBe("Amara Okoye suspended Daniel Reyes’s account")
    expect(describeActivity({ ...base, action: "reinstated", from: null })).toBe("Amara Okoye reinstated Daniel Reyes’s account")
    expect(describeActivity({ ...base, action: "unsubscribed", from: null })).toBe("Amara Okoye removed Daniel Reyes from the mailing list")
  })
})
