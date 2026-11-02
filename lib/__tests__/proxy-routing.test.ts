/**
 * Host routing for the consumer/business product split.
 *
 * Every case here returns before the Supabase session refresh at the bottom of
 * proxy(), so none of this needs a mocked auth client — if a test ever hangs,
 * the rule under test stopped short-circuiting and started falling through to
 * the refresh, which is itself the bug.
 *
 * The first block is the rollback story: with DOMAIN_SPLIT_ENABLED unset, the
 * business rules must be inert. That is what makes this safe to ship ahead of
 * DNS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"

const APP = "https://app.gettailr.com"
const BUSINESS = "https://agencies.gettailr.com"

function req(host: string, path: string): NextRequest {
  return new NextRequest(`https://${host}${path}`, { headers: { host } })
}

/** null when the proxy did not redirect. */
async function redirectTo(host: string, path: string): Promise<string | null> {
  const res = await proxy(req(host, path))
  const location = res.headers.get("location")
  return res.status >= 300 && res.status < 400 ? location : null
}

function enableSplit() {
  vi.stubEnv("DOMAIN_SPLIT_ENABLED", "true")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP)
  vi.stubEnv("NEXT_PUBLIC_BUSINESS_URL", BUSINESS)
  vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://www.gettailr.com")
}

beforeEach(() => {
  // A path the proxy does NOT redirect falls through to the Supabase session
  // refresh, which needs a URL and key to construct its client. Placeholders
  // are enough — getUser() over a bad origin rejects, and the refresh is
  // deliberately not awaited into a throw.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("with the split disabled, the business rules are inert", () => {
  it("does not move a business path off www", async () => {
    vi.stubEnv("DOMAIN_SPLIT_ENABLED", "")
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_URL", BUSINESS)
    expect(await redirectTo("www.gettailr.com", "/agencies")).toBeNull()
  })

  it("does not move a consumer path off the business host", async () => {
    vi.stubEnv("DOMAIN_SPLIT_ENABLED", "")
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_URL", BUSINESS)
    expect(await redirectTo("agencies.gettailr.com", "/tailor")).toBeNull()
  })
})

describe("business paths land on the business host", () => {
  it.each([
    ["www.gettailr.com", "/agencies"],
    ["gettailr.com", "/agencies/roles/abc"],
    ["app.gettailr.com", "/hiring"],
  ])("%s%s → business", async (host, path) => {
    enableSplit()
    expect(await redirectTo(host, path)).toBe(`${BUSINESS}${path}`)
  })

  it("preserves the query string", async () => {
    enableSplit()
    expect(await redirectTo("www.gettailr.com", "/hiring?next=%2Fx")).toBe(
      `${BUSINESS}/hiring?next=%2Fx`
    )
  })
})

describe("consumer paths land on the app host", () => {
  it("moves a consumer path off the business host", async () => {
    enableSplit()
    expect(await redirectTo("agencies.gettailr.com", "/tailor")).toBe(`${APP}/tailor`)
  })

  it("sends the business front page to the recruiter product", async () => {
    enableSplit()
    expect(await redirectTo("agencies.gettailr.com", "/")).toBe(`${BUSINESS}/agencies`)
  })
})

describe("the doorways stay on the consumer app", () => {
  // A candidate exercising a right, or a referee declining to comment, must
  // not be sent to a domain branded for the agency they are answering.
  it.each(["/portal/tok", "/rights/tok", "/consent/tok", "/reference/tok"])(
    "%s off the business host → app",
    async (path) => {
      enableSplit()
      expect(await redirectTo("agencies.gettailr.com", path)).toBe(`${APP}${path}`)
    }
  )
})

describe("host-neutral paths are never redirected", () => {
  // The sign-in engine is shared by both doors, and a magic-link completion
  // must finish on the host it started on — confirm-sign-in.tsx navigates
  // relatively on purpose, because an absolute origin drops the session it
  // just minted. Redirecting an API call cross-origin would likewise turn a
  // working same-origin POST into a CORS failure.
  it.each([
    ["agencies.gettailr.com", "/auth/confirm"],
    ["agencies.gettailr.com", "/api/auth/request-otp"],
    ["agencies.gettailr.com", "/api/agency/dashboard"],
    ["www.gettailr.com", "/api/agency/dashboard"],
    ["www.gettailr.com", "/api/hiring/accept"],
  ])("%s%s is served where it is asked for", async (host, path) => {
    enableSplit()
    expect(await redirectTo(host, path)).toBeNull()
  })
})

describe("auth params are never swallowed", () => {
  it("keeps an auth error on the app host rather than the marketing home", async () => {
    enableSplit()
    expect(await redirectTo("app.gettailr.com", "/?error=access_denied")).toBe(
      `${APP}/tailor?error=access_denied`
    )
  })
})
