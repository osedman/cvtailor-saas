/**
 * The sign-in copy must not assert an OTP length.
 *
 * Both sign-in surfaces said "6-digit code" while the input accepted 8 and
 * the mail sent 8 — the code length is Supabase project configuration, not
 * something the UI knows. Flagged in the 14 Aug walk-through, still wrong on
 * 22 Aug, and exactly the kind of small lie that makes a person believe they
 * have the wrong code and give up.
 *
 * The rule: name no number. The input's maxLength stays generous.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"

const SURFACES = ["components/auth/sign-in-modal.tsx", "app/agencies/sign-in/page.tsx"]

describe("sign-in copy", () => {
  it("claims no specific code length anywhere", () => {
    const offenders: string[] = []
    for (const f of SURFACES) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8")
      // "6-digit", "6 digit", "eight-digit" — any asserted length is a lie
      // waiting for a config change.
      if (/\b(\d+|six|seven|eight)[- ]digit/i.test(src)) offenders.push(f)
    }
    expect(offenders, `these assert a code length: ${offenders.join(", ")}`).toEqual([])
  })

  it("still accepts a code longer than six", () => {
    for (const f of SURFACES) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8")
      const m = src.match(/maxLength=\{(\d+)\}/)
      expect(m, `${f} has no maxLength on the code input`).toBeTruthy()
      expect(Number(m![1]), `${f} truncates the code`).toBeGreaterThanOrEqual(8)
    }
  })
})
