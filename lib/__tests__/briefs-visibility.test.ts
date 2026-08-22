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

  it("renders a band with a route into the inbox, and a switch for elsewhere", () => {
    expect(page).toMatch(/Briefs from your clients/)
    expect(page).toMatch(/router\.push\("\/agencies\/briefs"\)/)
    // The elsewhere hint carries the switch — the same validated session
    // endpoint the sidebar switcher uses, never a raw cookie write.
    const band = page.slice(page.indexOf("agd-briefs"))
    expect(band.slice(0, 3000)).toMatch(/\/api\/agency\/session/)
    expect(band.slice(0, 3000)).toMatch(/has {e\.count} brief/)
  })

  it("says what accepting does in both JD states", () => {
    expect(page).toMatch(/JD attached — accepting carries it straight into intake/)
    expect(page).toMatch(/No JD — accepting opens intake to paste or upload one/)
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
