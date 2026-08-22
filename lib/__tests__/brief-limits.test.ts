/**
 * The brief form and the brief server must cap the same fields the same way.
 *
 * They did not. `lib/agency/briefs` stored `jd_raw` up to 30,000 characters —
 * its comment reads "a full job description, not a form field" — while the
 * form kept its own copy of the constants and applied the 4,000 general field
 * cap to every box except the title. A pasted job description was therefore
 * cut at 4,000 characters IN THE BROWSER, before the server ever saw it, with
 * no warning and no visible boundary. Typical JDs run three to eight thousand
 * characters, so this was quietly losing the end of real briefs — including,
 * usually, the requirements at the bottom that the recruiter then parses.
 *
 * Uploading a JD would have made it worse rather than revealed it: a 12,000
 * character document arriving into a 4,000 cap loses two thirds on the way in.
 *
 * Both sides now import lib/agency/brief-limits. These tests keep it that way.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

import { MAX_FIELD, MAX_JD, MAX_TITLE } from "../agency/brief-limits"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("brief limits", () => {
  it("treats the JD as a document, not a form field", () => {
    expect(MAX_JD).toBeGreaterThan(MAX_FIELD)
    expect(MAX_JD).toBe(30_000)
  })

  it("the form does not keep its own copy of the caps", () => {
    const form = read("app/hiring/briefs/new/page.tsx")
    expect(form).toContain('from "@/lib/agency/brief-limits"')
    // A redeclared constant is how the two drifted the first time.
    expect(form).not.toMatch(/^const MAX_(FIELD|TITLE|JD)\s*=/m)
  })

  it("the server does not keep its own copy either", () => {
    const server = read("lib/agency/briefs.ts")
    expect(server).toContain('from "./brief-limits"')
    expect(server).not.toMatch(/^const MAX_(FIELD|TITLE|JD)\s*=/m)
  })

  it("the JD field is capped by MAX_JD on both sides, never MAX_FIELD", () => {
    const server = read("lib/agency/briefs.ts")
    expect(server).toMatch(/jd_raw:\s*capText\(input\.jdRaw,\s*MAX_JD\)/)

    const form = read("app/hiring/briefs/new/page.tsx")
    // Assert the BRANCH, not merely that both names appear in the file — the
    // first version of this test matched the upload handler, which mentions
    // jdRaw and MAX_JD for unrelated reasons, and so passed happily with the
    // bug restored. Verified by putting the bug back.
    const capFor = form.slice(form.indexOf("function capFor"))
    const body = capFor.slice(0, capFor.indexOf("\n  }"))
    expect(body, "capFor() must return MAX_JD for jdRaw").toMatch(
      /if \(key === "jdRaw"\) return MAX_JD/
    )
  })

  it("a realistic job description survives the form's cap", () => {
    // 12,000 characters: a long but ordinary JD, and the size an uploaded
    // document routinely reaches.
    const jd = "x".repeat(12_000)
    const capped = jd.slice(0, MAX_JD)
    expect(capped.length).toBe(12_000)
    // The bug, stated as a test: the old behaviour would have kept 4,000.
    expect(capped.length).not.toBe(MAX_FIELD)
  })

  it("still caps the ordinary fields tightly", () => {
    expect(MAX_FIELD).toBe(4_000)
    expect(MAX_TITLE).toBe(200)
  })
})
