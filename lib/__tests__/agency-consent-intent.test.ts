/**
 * The wall between what someone pressed in an email and what they consented to.
 *
 * The consent ask sends `?a=yes` / `?a=no` so the page can acknowledge a click
 * that would otherwise look like it did nothing. Everything here exists to stop
 * that acknowledgement quietly becoming an answer — because the thing that
 * follows a link in an email is very often not a person: mail clients prefetch,
 * corporate scanners open every URL, spam filters fetch to classify.
 *
 * If `?a=yes` reached the consent record, a link scanner would have consented
 * to recording someone's interview on their behalf. If it merely pre-selected
 * the radio, the page would be showing that person a decision they never made
 * and inviting them to press save on it. Both are the same failure.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { parseIntent, intentPhrase } from "@/lib/agency/consent-intent"

const page = readFileSync(join(process.cwd(), "app/consent/[token]/page.tsx"), "utf8")
// Scans read CODE, not the comments describing the prohibition — this file's
// own header explains what must never happen, and a naive scan trips on it.
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("parseIntent reads only what the email sends", () => {
  it("reads the two values the consent email actually sends", () => {
    expect(parseIntent("?a=yes")).toBe("yes")
    expect(parseIntent("?a=no")).toBe("no")
    // The leading ? is optional — window.location.search omits it when empty.
    expect(parseIntent("a=yes")).toBe("yes")
  })

  it("is null for anything else, rather than guessing", () => {
    for (const search of [
      "",
      "?",
      "?a=",
      "?a=YES", // case matters; the email sends lowercase
      "?a=y",
      "?a=true",
      "?a=granted", // the DECISION vocabulary must not work here
      "?a=declined",
      "?b=yes",
      "?a=yes%00",
      "?a[]=yes",
    ]) {
      expect(parseIntent(search), search).toBeNull()
    }
  })

  it("takes the first value when the parameter is repeated", () => {
    // URLSearchParams.get returns the first. Asserted so a swap to getAll —
    // which would return an array and make the ternary truthy for anything —
    // fails here rather than in front of a candidate.
    expect(parseIntent("?a=yes&a=no")).toBe("yes")
    expect(parseIntent("?a=bogus&a=yes")).toBeNull()
  })

  it("says both answers the same way", () => {
    expect(intentPhrase("yes")).toBe("record it")
    expect(intentPhrase("no")).toBe("do not record it")
    // Neither phrase carries a recommendation, a default or an exclamation.
    for (const p of [intentPhrase("yes"), intentPhrase("no")]) {
      expect(p).not.toMatch(/recommend|prefer|best|should|!/i)
    }
  })
})

describe("an intent never becomes an answer", () => {
  /**
   * STRUCTURAL, not keyword-based. The first version of this test asserted
   * that no setChoice call mentioned "intent" or "search", and a deliberate
   * mutation walked straight through it by naming the variable `i`. A guard
   * that only catches the careless version of a mistake is decoration.
   *
   * So: setChoice exists exactly twice, each call takes a string LITERAL, and
   * each sits inside a radio's onChange. Any third caller, and any call whose
   * argument is computed from anything at all, fails here.
   */
  it("the page sets the choice only from the two radios, and only to a literal", () => {
    const calls = [...pageCode.matchAll(/setChoice\(([^)]*)\)/g)]
    expect(calls.length, "setChoice should be called exactly twice").toBe(2)

    const args = calls.map((m) => m[1].trim()).sort()
    expect(args).toEqual(['"declined"', '"granted"'])

    // Each call is the whole body of a radio's onChange handler.
    for (const m of calls) {
      const before = pageCode.slice(Math.max(0, m.index - 24), m.index)
      expect(before, `setChoice(${m[1]}) is not inside an onChange`).toMatch(
        /onChange=\{\(\)\s*=>\s*$/
      )
    }
  })

  it("the radios' checked state is driven by choice alone", () => {
    const checks = pageCode.match(/checked=\{[^}]*\}/g) ?? []
    expect(checks.length).toBe(2)
    for (const c of checks) {
      expect(c).toMatch(/choice ===/)
      expect(c).not.toMatch(/intent/)
    }
  })

  it("save is never called from the intent effect", () => {
    // Anchor asserted, not assumed: indexOf(-1) would slice from the end and
    // pass this test vacuously against any file at all.
    const at = pageCode.indexOf("setIntent(")
    expect(at, "the intent effect has moved — re-point this test").toBeGreaterThan(-1)
    const effect = pageCode.slice(at)
    const untilEffectEnd = effect.slice(0, effect.indexOf("}, [])") + 6)
    expect(untilEffectEnd).not.toMatch(/\bsave\(/)
    expect(untilEffectEnd).not.toMatch(/setChoice\(/)
    expect(untilEffectEnd).not.toMatch(/fetch\(/)
  })

  it("neither radio is pre-selected", () => {
    expect(pageCode).not.toMatch(/defaultChecked/)
    expect(pageCode).toMatch(/useState<"granted" \| "declined" \| "">\(""\)/)
  })
})
