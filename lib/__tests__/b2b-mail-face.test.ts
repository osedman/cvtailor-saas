/**
 * Mail is a B2B surface, and it drifted.
 *
 * When the product moved to Noto Sans (28 Sep) the screens moved and the mail
 * did not. What went out was three different voices: the sign-in email in
 * Georgia SERIF — a leftover of the Fraunces era, on the agencies door as much
 * as the consumer one — and the notice, closure and notification templates on
 * a bare system stack. A recruiter's candidate got a serif sign-in and a sans
 * notice from the same product on the same day.
 *
 * So the face is one constant now (lib/email-style.ts), and this is what stops
 * it drifting again. Two different failures are covered because they fail
 * differently:
 *
 * 1. The template RENDERS the stack. A `${EMAIL_SANS}` written into a plain
 *    quoted string instead of a template literal type-checks perfectly and
 *    ships the literal characters into a style attribute; only rendering the
 *    HTML catches it.
 * 2. The source carries no hardcoded face. Scanned through tsCode() because
 *    this very file names Georgia in prose, and a naive scan would match its
 *    own explanation — the trap source-scan.ts exists for.
 *
 * The consumer lifecycle mail (welcomeEmailHtml, winBackEmailHtml) is NOT in
 * scope here: it is the consumer brand, and it names 'Hanken Grotesk', a face
 * used nowhere else in the product. Left alone deliberately rather than swept
 * in — but it is worth someone's decision.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"

import { closureHtml } from "@/lib/agency/closure"
import { noticeHtml } from "@/lib/agency/notices"
import { EMAIL_SANS } from "@/lib/email-style"
import { tsCode } from "./helpers/source-scan"

const ROOT = path.resolve(__dirname, "../..")
const read = (p: string) => tsCode(readFileSync(path.join(ROOT, p), "utf8"))

describe("B2B mail speaks the product's face", () => {
  it("names Noto Sans first, then a system fallback — webfonts do not survive email", () => {
    expect(EMAIL_SANS.startsWith("'Noto Sans'")).toBe(true)
    expect(EMAIL_SANS).toMatch(/sans-serif$/)
    expect(EMAIL_SANS).not.toMatch(/serif(?<!sans-serif)$/)
  })

  it("renders the stack into the closure email, not the placeholder", () => {
    const html = closureHtml({
      candidateName: "Amara Okonkwo",
      agencyName: "Acme Search",
      roleTitle: "Senior Platform Engineer",
      retentionDays: 90,
      rightsUrl: "https://example.com/rights/tok",
    })
    expect(html).toContain(EMAIL_SANS)
    // A template literal that was never one renders "${EMAIL_SANS}" verbatim.
    expect(html).not.toContain("${")
  })

  it("renders the stack into the candidate notice too", () => {
    const html = noticeHtml({
      candidateName: "Amara Okonkwo",
      agencyName: "Acme Search",
      roleTitle: "Senior Platform Engineer",
      retentionDays: 90,
      rightsUrl: "https://example.com/rights/tok",
    } as Parameters<typeof noticeHtml>[0])
    expect(html).toContain(EMAIL_SANS)
    expect(html).not.toContain("${")
  })

  it("leaves no hardcoded face in the sign-in email or the agency templates", () => {
    const files = [
      "app/api/auth/request-otp/route.ts",
      "lib/agency/closure.ts",
      "lib/agency/notices.ts",
      "lib/agency/notify.ts",
    ]
    const offenders: string[] = []
    for (const f of files) {
      const code = read(f)
      // The six-digit sign-in code sets ui-monospace on purpose and is
      // allowlisted in the typography guardrail; every other declaration in
      // these files must come from the shared constant.
      for (const m of code.matchAll(/font-family:\s*([^;"'`]+)/g)) {
        const value = m[1].trim()
        if (value.startsWith("${EMAIL_SANS}")) continue
        if (value.startsWith("ui-monospace")) continue
        offenders.push(`${f}: ${value.slice(0, 60)}`)
      }
    }
    expect(
      offenders,
      "Mail sets a face directly instead of importing EMAIL_SANS from lib/email-style. " +
        "One constant, or the templates drift apart again.",
    ).toEqual([])
  })
})
