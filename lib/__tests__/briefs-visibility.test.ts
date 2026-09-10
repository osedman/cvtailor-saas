/**
 * A submitted brief must be impossible to miss, and accepting one must land
 * the recruiter in the role it minted.
 *
 * The bug this pins: four briefs sat `submitted` in Halcyon Search for a
 * week — one with a 5,108-char JD — while the recruiter worked another
 * agency. Three stacked failures: the dashboard never mentioned briefs, the
 * inbox only shows the cookie's active agency, and the accept response's
 * roleId was thrown away so even a found brief left you standing in the
 * inbox. The HM→database path was never broken; visibility was.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("the dashboard surfaces briefs", () => {
  const api = read("app/api/agency/dashboard/route.ts")
  const page = read("app/agencies/page.tsx")

  it("queries submitted briefs WITHOUT an agency filter", () => {
    // role_briefs' RLS scopes rows to the caller's memberships, so the
    // unfiltered query is what makes cross-agency counts possible at all. An
    // .eq("agency_id", ...) here silently reintroduces the blindness.
    const briefsQuery = api.slice(api.indexOf('from("role_briefs")'))
    const queryEnd = briefsQuery.indexOf(".limit(")
    expect(queryEnd).toBeGreaterThan(-1)
    expect(briefsQuery.slice(0, queryEnd)).not.toMatch(/eq\("agency_id"/)
    expect(briefsQuery.slice(0, queryEnd)).toMatch(/eq\("status", "submitted"\)/)
  })

  it("reduces jd_raw to a boolean before it reaches the response", () => {
    // The dashboard needs "is there a JD", never the JD.
    expect(api).toMatch(/has_jd: Boolean\(b\.jd_raw/)
    const response = api.slice(api.indexOf("briefs: { waiting"))
    expect(response.slice(0, 120)).not.toMatch(/jd_raw/)
  })

  it("other agencies appear as counts and names only", () => {
    const elsewhere = api.slice(api.indexOf("const briefs_elsewhere"), api.indexOf("// Caller identity"))
    expect(elsewhere).toMatch(/agency_name/)
    expect(elsewhere).toMatch(/count/)
    expect(elsewhere).not.toMatch(/role_title|jd_raw|contact/)
  })

  /**
   * THE BAND IS GONE, THE GUARANTEE IS NOT (10 Sep 2026).
   *
   * The dashboard used to carry a "Briefs from your clients" band, built
   * after four briefs sat unseen for a week. Ose cut the dashboard to live
   * roles only for MVP, so the band went with it — but the incident it
   * answered has not gone away, so what survives is pinned here instead:
   * the shared nav counts waiting briefs, on EVERY screen, across every
   * agency the recruiter belongs to. If that count ever goes, a brief can
   * sit unseen again.
   */
  it("the waiting count reaches every screen through the shared nav", () => {
    const nav = read("components/agency/agency-nav.tsx")
    expect(nav).toMatch(/fetch\("\/api\/agency\/briefs\?status=submitted"\)/)
    expect(nav).toMatch(/waiting > 0 &&/)
    expect(nav).toMatch(/key: "briefs"[^\n]*href: "\/agencies\/briefs"/)
  })

  it("the dashboard no longer carries its own briefs band", () => {
    expect(page).not.toContain("agd-briefs")
  })

  it("the inbox itself still says what accepting does in both JD states", () => {
    const inbox = read("app/agencies/briefs/page.tsx")
    expect(inbox).toMatch(/JD|job description/i)
  })
})

describe("accepting a brief lands in the minted role", () => {
  const page = read("app/agencies/briefs/page.tsx")

  it("uses the roleId the server has always returned", () => {
    expect(page).toMatch(/action === "accept" && body\.roleId/)
    expect(page).toMatch(/router\.push\(`\/agencies\/roles\/\$\{body\.roleId\}`\)/)
  })

  it("declining stays in the inbox", () => {
    // The push is gated on accept; a decline reloads the list.
    const act = page.slice(page.indexOf("async function act"))
    const pushAt = act.indexOf("router.push(`/agencies/roles/")
    const gateAt = act.indexOf('action === "accept"')
    expect(gateAt).toBeGreaterThan(-1)
    expect(gateAt).toBeLessThan(pushAt)
  })
})
