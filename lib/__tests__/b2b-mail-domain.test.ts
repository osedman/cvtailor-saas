/**
 * Agency mail sends from the B2B domain once it is configured (29 Sep 2026).
 *
 * tailrecruit.com exists so an agency's candidates and clients never get mail
 * from the consumer brand. The domain is B2B_MAIL_DOMAIN — config — and the
 * default stays gettailr.com, because Resend refuses a sender on a domain it
 * has not verified: defaulting to the new domain would silently stop every
 * agency email. These tests pin both halves, and fail the build if a sender
 * address is hardcoded back into the agency trees.
 */
import { describe, it, expect, afterEach } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { agencyNoticeFrom, b2bFrom, b2bMailDomain } from "@/lib/email-senders"

const root = join(__dirname, "..", "..")

afterEach(() => {
  delete process.env.B2B_MAIL_DOMAIN
})

describe("b2bMailDomain", () => {
  it("defaults to gettailr.com — the only verified sender until Resend says otherwise", () => {
    expect(b2bMailDomain()).toBe("gettailr.com")
  })
  it("uses B2B_MAIL_DOMAIN when set", () => {
    process.env.B2B_MAIL_DOMAIN = "tailrecruit.com"
    expect(b2bMailDomain()).toBe("tailrecruit.com")
    expect(b2bFrom()).toBe("Tailr for Agencies <hello@tailrecruit.com>")
    expect(agencyNoticeFrom("Halcyon Search")).toBe("Halcyon Search via Tailr <notices@tailrecruit.com>")
  })
  it("ignores a malformed value rather than sending from nowhere", () => {
    for (const bad of ["", "   ", "not a domain", "https://tailrecruit.com", "tailrecruit"]) {
      process.env.B2B_MAIL_DOMAIN = bad
      expect(b2bMailDomain(), bad).toBe("gettailr.com")
    }
  })
  it("an agency name cannot break the From header", () => {
    expect(agencyNoticeFrom('Evil <x@y.com>\r\nBcc: z')).not.toMatch(/[<>]\s*x@y|\r|\n/)
    expect(agencyNoticeFrom("")).toBe("Your recruiter via Tailr <notices@gettailr.com>")
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === "__tests__" || name === "node_modules") continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe("no agency code hardcodes a sender address", () => {
  const trees = ["lib/agency", "app/api/agency", "app/api/hiring", "app/agencies", "app/hiring"].map((t) => join(root, t))
  it("no @gettailr.com (or any) literal From in the agency trees", () => {
    const offenders: string[] = []
    for (const f of trees.flatMap((t) => walk(t))) {
      const code = tsCode(readFileSync(f, "utf8"))
      if (/from:\s*[`"'][^`"']*@[a-z0-9-]+\.[a-z]/i.test(code)) offenders.push(f.replace(root + "/", ""))
    }
    expect(offenders).toEqual([])
  })
  it("the business sign-in door sends from the B2B domain", () => {
    const route = tsCode(readFileSync(join(root, "app/api/auth/request-otp/route.ts"), "utf8"))
    expect(route).toMatch(/from: door === "business" \? b2bFrom\(\) : undefined/)
  })
})
