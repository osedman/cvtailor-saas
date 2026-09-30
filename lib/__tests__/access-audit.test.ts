/**
 * The 30 Sep 2026 access audit: every API route reviewed for one user or
 * agency reaching another's data. Each hole it found is pinned here.
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { trustedOrigin } from "@/lib/site-url"
import { safeNextPath } from "@/lib/auth-paths"
import { isPrivateAddress, fetchPublicUrl, BlockedUrlError } from "@/lib/net/public-fetch"
import { withoutOwnership } from "@/lib/tracker-body"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("sign-in links only ever point at our own origins", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("a forged Origin is refused; ours is kept", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.gettailr.com")
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_URL", "https://agencies.gettailr.com")
    expect(trustedOrigin("https://evil.example")).toBeNull()
    expect(trustedOrigin("https://app.gettailr.com.evil.example")).toBeNull()
    expect(trustedOrigin(null)).toBeNull()
    expect(trustedOrigin("https://app.gettailr.com")).toBe("https://app.gettailr.com")
    expect(trustedOrigin("https://agencies.gettailr.com")).toBe("https://agencies.gettailr.com")
  })

  it("a preview deployment trusts its own URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.gettailr.com")
    vi.stubEnv("VERCEL_BRANCH_URL", "tailr-git-staging.vercel.app")
    expect(trustedOrigin("https://tailr-git-staging.vercel.app")).toBe("https://tailr-git-staging.vercel.app")
    expect(trustedOrigin("https://tailr-git-other.vercel.app")).toBeNull()
  })

  it("request-otp never builds the link from the raw header", () => {
    const route = read("app/api/auth/request-otp/route.ts")
    expect(route).toMatch(/trustedOrigin\(request\.headers\.get\("origin"\)\)/)
    expect(route).not.toMatch(/request\.headers\.get\("origin"\)\s*\|\|/)
  })
})

describe("the post-sign-in next path stays on this site", () => {
  it.each(["/\t/evil.com", "/\n/evil.com", "/\r//evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "/%0a"])(
    "refuses %j",
    (p) => {
      if (p === "/%0a") expect(safeNextPath(p)).toBe("/%0a") // encoded is inert: stays a path
      else expect(safeNextPath(p)).toBeNull()
    }
  )
  it("keeps real paths", () => {
    expect(safeNextPath("/agencies/roles/abc?x=1")).toBe("/agencies/roles/abc?x=1")
  })
})

describe("a JD link cannot reach our own network", () => {
  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true)
  )
  it.each(["8.8.8.8", "104.18.1.1", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false))

  it("refuses literal private addresses and localhost before any request", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
    for (const u of ["http://169.254.169.254/latest/meta-data", "http://localhost:3000", "http://[::1]/", "ftp://example.com", "http://user:pw@example.com"]) {
      await expect(fetchPublicUrl(u)).rejects.toBeInstanceOf(BlockedUrlError)
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it("the parse route uses it, with redirects checked by hand", () => {
    const route = read("app/api/agency/roles/[roleId]/parse/route.ts")
    expect(route).toMatch(/fetchPublicUrl\(u,/)
    expect(route).not.toMatch(/redirect: "follow"/)
    expect(route).toMatch(/assertWriter\(auth\.ctx\)/)
  })
})

describe("a client cannot make another client's role theirs", () => {
  it("a window the client offered is not a tie", () => {
    const header = read("lib/agency/client-header.ts")
    const fn = header.slice(header.indexOf("export async function listClientRoles"), header.indexOf("export interface ClientRoleHeader"))
    expect(fn).not.toMatch(/availability_slots/)
  })

  it("offering a window for a role requires an agency-made tie to it", () => {
    const rounds = read("lib/agency/rounds.ts")
    const fn = rounds.slice(rounds.indexOf("export async function offerSlot"), rounds.indexOf("export async function withdrawSlot"))
    expect(fn.indexOf("listClientRoles(ctx)")).toBeGreaterThan(-1)
    expect(fn.indexOf("listClientRoles(ctx)")).toBeLessThan(fn.indexOf('.from("availability_slots")'))
    expect(fn).toMatch(/throw new AgencyAccessError\("not your role"\)/)
  })

  it("the batch offers as the tied contact, never just the first link", () => {
    const cs = read("lib/agency/client-shortlist.ts")
    const fn = cs.slice(cs.indexOf("export async function offerWindows"))
    expect(fn).not.toMatch(/ctx\.links\[0\]/)
  })
})

describe("matched people are this agency's role only", () => {
  it("the role is proven to be the caller's before the service-role RPC", () => {
    const src = read("lib/agency/matched-people.ts")
    const fn = src.slice(src.indexOf("export async function listMatchedPeople"), src.indexOf("export async function inviteMatchedPerson"))
    const check = fn.indexOf('.eq("agency_id", ctx.agencyId)')
    expect(check).toBeGreaterThan(-1)
    expect(fn.indexOf('.from("job_roles")')).toBeLessThan(fn.indexOf('rpc("matched_people"'))
    expect(fn).toMatch(/throw new AgencyAccessError\("role not found"\)/)
  })
})

describe("tracker bodies cannot set server-owned columns", () => {
  it("strips id, owner and timestamps", () => {
    expect(withoutOwnership({ id: "x", user_id: "y", created_at: "z", updated_at: "w", company: "Acme" })).toEqual({ company: "Acme" })
    expect(withoutOwnership(null)).toEqual({})
    expect(withoutOwnership([1])).toEqual({})
  })
})

/* ── round two: "revoking should cut access, fix the rest too" (Ose, 30 Sep) ── */

describe("revoking the shortlist ends the role on every door", () => {
  it("the tie list drops a cut pair whatever tied it", () => {
    const src = read("lib/agency/client-header.ts")
    expect(src).toMatch(/revokedPairs\(contactIds\)/)
    expect(src).toMatch(/isCut\(cut, roleId, contactId\)/)
  })

  it.each([
    ["lib/agency/rounds.ts", "decideRound"],
    ["lib/agency/artifacts.ts", "recordDebrief"],
    ["lib/agency/round-requests.ts", "linkedRole"],
    ["lib/agency/final-choice.ts", "linkedRole"],
  ])("%s checks it in %s", (file, fn) => {
    const src = read(file)
    const body = src.slice(src.indexOf(`function ${fn}`))
    expect(body.slice(0, 3000)).toMatch(/assertNotRevoked\(/)
  })

  it("decision completions check it on both paths, and the brief and dashboard too", () => {
    expect((read("lib/agency/decision-completions.ts").match(/assertNotRevoked\(roleId, link\.contactId\)/g) ?? []).length).toBe(2)
    expect(read("app/api/hiring/roles/[roleId]/brief/route.ts")).toMatch(/isCut\(await revokedPairs/)
    expect(read("lib/agency/client-auth.ts")).toMatch(/const cut = await revokedPairs\(contactIds\)/)
  })

  it("a re-send restores access: only ALL-revoked pairs are cut", () => {
    const src = read("lib/agency/revocation.ts")
    expect(src).toMatch(/for \(const k of revoked\) if \(!live\.has\(k\)\) cut\.add\(k\)/)
  })
})

describe("the rest of the audit", () => {
  it("rights links are rate limited like the other doorways", () => {
    const src = read("app/api/rights/[token]/route.ts")
    expect((src.match(/checkDoorwayLimit\("rights"/g) ?? []).length).toBe(2)
    expect(src).toMatch(/checkDoorwayWriteLimit\("rights", token\)/)
  })

  it("the tailor page's CV reader and job fetcher are rate limited", () => {
    expect(read("app/api/parse-cv/route.ts")).toMatch(/checkPublicToolLimit\(req, "parse-cv"\)/)
    expect(read("app/api/scrape-job/route.ts")).toMatch(/checkPublicToolLimit\(req, "scrape-job"\)/)
  })

  it("accepting an invite needs a confirmed address", () => {
    const src = read("app/api/hiring/accept/route.ts")
    expect(src).toMatch(/if \(!user\.email_confirmed_at\)/)
    expect(src.indexOf("email_confirmed_at")).toBeLessThan(src.indexOf("acceptInvite(token"))
  })

  it("a recruiter cannot link a hiring manager around the invite", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260930130000_client_contact_link_guard.sql"), "utf8")
    expect(sql).toMatch(/current_user in \('authenticated', 'anon'\)/)
    expect(sql).toMatch(/before insert or update on agency\.client_contacts/)
  })

  it("team invites are rate limited and a re-invite is logged as a change", () => {
    const src = read("app/api/agency/team/route.ts")
    expect(src).toMatch(/checkRateLimit\(auth\.ctx\.userId, "team_invite"\)/)
    expect(src).toMatch(/action: current \? "changed" : "invited"/)
  })

  it("a recruiter can save interview defaults without touching owner settings", () => {
    const src = read("app/api/agency/settings/route.ts")
    expect(src).toMatch(/touchesOwnerSettings\s*\?\s*await updateAgencySettings/)
  })

  it("the consumer pool reads recommendations by the published role's id", () => {
    const src = read("lib/agency/consumer-pool.ts")
    expect(src).not.toMatch(/\.eq\("published_role_id", roleId\)/)
    expect(src).toMatch(/\.in\("published_role_id", publishedIds\)/)
  })

  it("interview settings never interpolate a non-uuid into the filter", () => {
    expect(read("lib/agency/interview-settings.ts")).toMatch(/const safeRole = UUID\.test\(roleId\) \? roleId : null/)
  })
})
