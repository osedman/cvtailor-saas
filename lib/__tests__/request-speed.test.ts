/**
 * Every request used to pay two network round trips to Supabase Auth before
 * doing any work: getUser() in the proxy, then getUser() again in the route's
 * context helper — plus two more lookups in series for memberships and names
 * (30 Sep 2026, Ose: "screens loading or submitting on buttons is too slow").
 * Pinned so the per-request Auth call cannot drift back in.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const fn = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}`)
  const j = src.indexOf("\nexport ", i + 10)
  return src.slice(i, j === -1 ? undefined : j)
}

describe("the per-request path verifies the session locally", () => {
  it("the proxy refreshes with getClaims, not getUser", () => {
    const proxy = read("proxy.ts")
    expect(proxy).toMatch(/auth\.getClaims\(\)/)
    expect(proxy).not.toMatch(/auth\.getUser\(\)/)
  })

  it("requireAgencyContext: getClaims, and memberships with names in one query", () => {
    const f = fn(read("lib/agency/db.ts"), "requireAgencyContext")
    expect(f).toMatch(/auth\.getClaims\(\)/)
    expect(f).not.toMatch(/getUser/)
    expect(f).toMatch(/select\("agency_id, role, created_at, agencies\(name\)"\)/)
    expect(f).not.toMatch(/from\("agencies"\)/)
  })

  it("requireHiringContext: getClaims, and contacts with names in one query", () => {
    const f = fn(read("lib/agency/client-auth.ts"), "requireHiringContext")
    expect(f).toMatch(/auth\.getClaims\(\)/)
    expect(f).not.toMatch(/getUser/)
    expect(f).toMatch(/agencies\(name\)/)
    expect(f).not.toMatch(/agencyNames\(/)
  })
})
