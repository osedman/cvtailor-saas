/**
 * The two consumer opt-ins.
 *
 * These are consent controls, so the properties worth pinning are not "does
 * the toggle work" — they are that consent cannot be recorded for someone
 * else, cannot be inferred from a sloppy request body, and cannot change
 * without leaving a record.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  CONSENT_SUBJECTS,
  CONSENT_COPY_VERSION,
  type ConsentSubject,
} from "@/lib/matching/limits"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("the two opt-ins are separate", () => {
  it("names the three, and only these three", () => {
    // Two on 16 Aug; discoverable joined on 5 Sep 2026 — the consent for the
    // LISTING alone, off by default. See supabase/migrations/20260905120000.
    expect([...CONSENT_SUBJECTS].sort()).toEqual(["discoverable", "enrichment", "matching"])
  })

  it("carries a copy version, so 'agreed to what?' has an answer", () => {
    expect(CONSENT_COPY_VERSION).toMatch(/\S/)
  })

  it("matches the values the database check constraint allows", () => {
    // The constraint was re-declared when the third subject arrived; the
    // latest declaration is the one Postgres holds.
    const sql = read("supabase/migrations/20260905120000_discoverable.sql")
    const decl = sql.slice(sql.indexOf("add constraint matching_consent_events_subject_check"))
    for (const subject of CONSENT_SUBJECTS) {
      expect(decl).toContain(`'${subject}'`)
    }
  })
})

describe("consent cannot be recorded for someone else", () => {
  const route = read("app/api/matching/preferences/route.ts")

  it("takes the user from the session, never from the request body", () => {
    // A route that accepted a user id would be a route that could record one
    // person's consent against another's account.
    expect(route).toMatch(/auth\.getUser\(\)/)
    expect(route).not.toMatch(/body\??\.\s*userId/)
    expect(route).not.toMatch(/body\??\.\s*user_id/)
  })

  it("refuses a non-boolean granted rather than coercing it", () => {
    // The one field where guessing is unacceptable: an absent or truthy-ish
    // value must never be read as agreement.
    expect(route).toMatch(/typeof body\?\.granted !== "boolean"/)
  })

  it("refuses an unknown subject", () => {
    expect(route).toMatch(/CONSENT_SUBJECTS\.includes/)
  })
})

describe("neither flag has an authenticated write path", () => {
  it("revokes the enrichment columns from clients", () => {
    // profiles.recruiter_visibility was directly writable with no record of
    // when or against what wording — the exact weakness that justified giving
    // matching its own opt-in.
    const sql = read("supabase/migrations/20260815160000_consent_subject_and_lock.sql")
    expect(sql).toMatch(
      /revoke update \(recruiter_visibility, recruiter_visibility_updated_at\)[\s\S]*from authenticated, anon/
    )
  })

  it("leaves the rest of the profile user-writable", () => {
    // A column-level revoke, not a policy change: name, country, cv_template
    // and the digest preference must keep working exactly as before.
    const sql = read("supabase/migrations/20260815160000_consent_subject_and_lock.sql")
    expect(sql).not.toMatch(/drop policy[\s\S]*profiles/i)
    expect(sql).not.toMatch(/revoke update on public\.profiles/)
  })

  it("gives match_preferences no write policy at all", () => {
    const sql = read("supabase/migrations/20260815090000_quiet_matching.sql")
    const policies = sql.match(/create policy \w+ on public\.match_preferences[\s\S]*?;/g) ?? []
    expect(policies.length).toBe(1)
    expect(policies[0]).toMatch(/for select/)
  })
})

describe("a change always leaves a record", () => {
  const module = read("lib/matching/preferences.ts")

  it("writes the consent event before the flag", () => {
    // If the second write fails we have a record of an intention that did not
    // take effect — recoverable and visible. The other order risks a changed
    // flag with no record of why.
    const eventAt = module.indexOf("matching_consent_events")
    const matchPrefAt = module.indexOf('from("match_preferences").upsert')
    const profileAt = module.indexOf('from("profiles")\n      .update')
    expect(eventAt).toBeGreaterThan(-1)
    expect(eventAt).toBeLessThan(matchPrefAt)
    expect(eventAt).toBeLessThan(profileAt === -1 ? Number.MAX_SAFE_INTEGER : profileAt)
  })

  it("stamps the copy version on every event", () => {
    expect(module).toMatch(/copy_version: CONSENT_COPY_VERSION/)
  })

  it("takes a userId and a subject and nothing that could stand in for a person", () => {
    // Same shape as recordDecision on the agency side: no context object, so
    // there is no code path by which one actor consents for another.
    const sig = module.slice(module.indexOf("export async function setConsent"))
    const params = sig.slice(sig.indexOf("("), sig.indexOf(")"))
    expect(params).toMatch(/userId: string/)
    expect(params).toMatch(/subject: ConsentSubject/)
    expect(params).not.toMatch(/ctx|context|onBehalf|actor/i)
  })
})

describe("the settings screen keeps promises the schema can back", () => {
  const page = read("app/settings/page.tsx")

  it("says the count an agency sees is rounded, not zero", () => {
    // The bucketed count is a real if thin disclosure. Implying it does not
    // exist would be the comfortable lie.
    expect(page).toMatch(/rounded count, never who/)
  })

  it("does not claim an application can be recalled", () => {
    // 'applied' is terminal in the database and cannot be reversed.
    expect(page).toMatch(/does not un-send an application/)
  })

  it("distinguishes a failed load from an empty one", () => {
    // An unset switch and an unreachable server must not look identical —
    // one of those is a statement about consent.
    expect(page).toMatch(/role="alert"/)
    expect(page).toMatch(/Try again/)
  })

  it("uses a real switch role so the state is announced", () => {
    expect(page).toMatch(/role="switch"/)
    expect(page).toMatch(/aria-checked=/)
  })

  it("never pre-selects either switch", () => {
    // Both options carry identical weight and off is the resting state.
    expect(page).not.toMatch(/defaultChecked/)
    expect(page).toMatch(/checked=\{state\.matching\}/)
    expect(page).toMatch(/checked=\{state\.enrichment\}/)
  })
})

describe("subject typing", () => {
  it("accepts only the two known subjects", () => {
    const ok: ConsentSubject[] = ["matching", "enrichment"]
    expect(ok.every((s) => CONSENT_SUBJECTS.includes(s))).toBe(true)
  })
})
