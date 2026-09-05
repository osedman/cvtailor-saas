/**
 * The discoverable list (smooth-flow plan, Wave 5b). The wall is restated
 * in code and in the schema; these scans pin it: the list comes only from
 * the RPC that joins the opt-in, the routes never read recommendations by
 * hand, the client cannot set `invited`, and the switch is off by default.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"
import { CONSENT_SUBJECTS, CONSENT_COPY_VERSION } from "../matching/limits"
import { matchBand } from "../agency/match-bands"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const sql = sqlCode(readFileSync(join(process.cwd(), "supabase/migrations/20260905120000_discoverable.sql"), "utf8"))

describe("the switch", () => {
  it("is a third subject, and the copy version moved with the wording", () => {
    expect([...CONSENT_SUBJECTS]).toEqual(["matching", "enrichment", "discoverable"])
    expect(CONSENT_COPY_VERSION).toBe("matching-2026-09-05")
  })
  it("is off by default and written only through setConsent", () => {
    expect(sql).toMatch(/discoverable\s+boolean not null default false/)
    expect(read("lib/matching/preferences.ts")).toMatch(/subject === "discoverable"/)
    expect(read("app/api/matching/preferences/route.ts")).not.toMatch(/discoverable/)
  })
  it("the settings copy tells the truth about the second promise", () => {
    expect(read("app/settings/page.tsx")).toMatch(/unless you turn on the third switch below/)
  })
})

describe("the list", () => {
  it("comes only from the RPC that joins the opt-in inside the database", () => {
    const src = read("lib/agency/matched-people.ts")
    expect(src).toMatch(/\.rpc\("matched_people", \{ p_role_id: roleId \}\)/)
    expect(src).not.toMatch(/from\("role_recommendations"\)\.select/)
    expect(sql).toMatch(/join public\.match_preferences mp[\s\S]{0,80}mp\.discoverable = true/)
    expect(sql).toMatch(/grant execute on function agency\.matched_people\(uuid\) to service_role/)
    expect(sql).toMatch(/revoke all on function agency\.matched_people\(uuid\) from anon, authenticated/)
  })
  it("projects what they consented to and nothing else", () => {
    expect(sql).not.toMatch(/p\.email/)
    expect(sql).not.toMatch(/tailor_history/)
    const src = read("lib/agency/matched-people.ts")
    expect(src).not.toMatch(/email/)
  })
  it("bands, never an ordinal rank", () => {
    expect(matchBand(95)).toBe("very strong")
    expect(matchBand(80)).toBe("strong")
    expect(matchBand(70)).toBe("fit")
    expect(read("app/agencies/roles/[roleId]/page.tsx")).not.toMatch(/matched\?\.people\.map\(\(p, (i|rank)\)/)
  })
})

describe("invited", () => {
  it("only the service role can set it, and a dismissed or applied row is never revived", () => {
    expect(sql).toMatch(/if new\.state in \('applied', 'invited'\) and old\.state is distinct from new\.state then/)
    expect(read("lib/agency/matched-people.ts")).toMatch(/\.update\(\{ state: "invited" \}\)[\s\S]{0,80}\.in\("state", \["new", "seen"\]\)/)
  })
  it("the consumer's own transitions stay seen and dismissed", () => {
    expect(read("app/api/found/[id]/route.ts")).toMatch(/const ALLOWED: FoundTransition\[\] = \["seen", "dismissed"\]/)
  })
  it("is audited from the agency side", () => {
    expect(read("lib/agency/matched-people.ts")).toMatch(/action: "invited"/)
  })
  it("shows on the person's card", () => {
    expect(read("app/found/page.tsx")).toMatch(/active\.state === "invited"/)
  })
})
