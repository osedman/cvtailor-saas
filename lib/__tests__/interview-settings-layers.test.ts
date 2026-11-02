/**
 * Two layers of interview rules: the agency's default, and a role's override.
 *
 * WHY THIS EXISTS. Until 19 September 2026 there was no agency layer at all —
 * `interview_settings.role_id` was the primary key and NOT NULL, so the
 * 24-hour minimum notice could only be changed one role at a time, forever. A
 * desk that books same-day had to remember on every role, and forgetting
 * produced a candidate doorway that offered no times and looked broken while
 * working perfectly. It cost two sessions on 15 and 18 September.
 *
 * The resolver is pure so it can be tested without a database, and it is the
 * ONE rule — the same shape as `resolvePreference` in notify.ts. Two
 * derivations of "which setting applies" would disagree the first time either
 * changed.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { DEFAULT_SETTINGS, resolveSettingsRows } from "../agency/interview-rules"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const ROLE = "11111111-1111-1111-1111-111111111111"
const OTHER = "22222222-2222-2222-2222-222222222222"

describe("which rules apply", () => {
  it("uses the role's own row when it has one", () => {
    const { row, source } = resolveSettingsRows(
      [{ role_id: null, tag: "agency" }, { role_id: ROLE, tag: "role" }],
      ROLE
    )
    expect(row?.tag).toBe("role")
    expect(source).toBe("role")
  })

  it("falls back to the agency default when the role has none", () => {
    const { row, source } = resolveSettingsRows([{ role_id: null, tag: "agency" }], ROLE)
    expect(row?.tag).toBe("agency")
    expect(source).toBe("agency")
  })

  it("falls back to the product default when nobody has set anything", () => {
    const { row, source } = resolveSettingsRows([], ROLE)
    expect(row).toBeNull()
    expect(source).toBe("default")
  })

  it("never reads another role's override", () => {
    // The whole point of the layering is that a role inherits the AGENCY's
    // default, not whatever some other role happens to say.
    const { row, source } = resolveSettingsRows(
      [{ role_id: OTHER, tag: "someone else" }, { role_id: null, tag: "agency" }],
      ROLE
    )
    expect(row?.tag).toBe("agency")
    expect(source).toBe("agency")
  })

  it("prefers the role even when the rows arrive in the other order", () => {
    // Row order is whatever Postgres returns; precedence must not depend on it.
    const a = resolveSettingsRows([{ role_id: ROLE, tag: "role" }, { role_id: null, tag: "agency" }], ROLE)
    const b = resolveSettingsRows([{ role_id: null, tag: "agency" }, { role_id: ROLE, tag: "role" }], ROLE)
    expect(a.row?.tag).toBe("role")
    expect(b.row?.tag).toBe("role")
  })

  it("the product default is still 24 hours", () => {
    // Changing this changes what every desk that has set nothing owes every
    // candidate. It should take a deliberate edit and a failing test.
    expect(DEFAULT_SETTINGS.minNoticeHours).toBe(24)
  })
})

describe("the write path matches the schema it writes to", () => {
  const lib = code(read("lib/agency/interview-settings.ts"))

  it("does not upsert interview_settings", () => {
    // role_id's primary key became two PARTIAL unique indexes when it went
    // nullable, and a partial unique index cannot be a PostgREST onConflict
    // target — the inference needs the index predicate, which the query
    // string cannot carry. An upsert would fail at conflict-resolution time,
    // not at deploy time, which is the worst place to find out.
    // Scoped to THIS table on purpose: interview_templates upserts on a real
    // unique constraint (agency_id, name) and is correct to. A blanket "no
    // upserts in this file" caught that and was wrong.
    expect(lib).not.toMatch(/from\("interview_settings"\)[\s\S]{0,300}\.upsert\(/)
    // And the writer that replaced it reads before it branches.
    expect(lib).toMatch(/async function writeSettingsRow[\s\S]{0,1600}\.insert\(columns\)/)
  })

  it("writes the agency default through the same one writer", () => {
    // Two writers would be two chances for the layers to diverge in what they
    // store, and the resolver assumes both rows carry the same columns.
    expect(lib).toMatch(/setAgencyInterviewDefaults[\s\S]{0,600}writeSettingsRow\(\s*ctx\.agencyId,\s*null/)
  })

  it("only a writer may change what a whole desk owes candidates", () => {
    expect(lib).toMatch(/setAgencyInterviewDefaults[\s\S]{0,200}assertWriter\(ctx\)/)
  })

  it("setting the agency default is audited", () => {
    expect(lib).toMatch(/defaults_updated|defaults_set/)
  })
})

describe("the migration keeps one default per agency", () => {
  const sql = read("supabase/migrations/20260918120000_agency_interview_settings_agency_default.sql")

  it("drops the primary key and the NOT NULL in ONE ordered statement", () => {
    /*
     * These were two ALTERs and it failed on staging on 19 Sep 2026 —
     * `42P16: column "role_id" is in a primary key`. The second ran with the
     * key still in place, and since the editor runs a script in a single
     * transaction the whole migration rolled back with nothing applied.
     *
     * So the transition is one DO block: drop, then nullable, in order, with
     * no chance of the two being split or reordered.
     */
    const block = sql.slice(sql.indexOf("do $mig$"), sql.indexOf("$mig$;"))
    expect(block).toBeTruthy()
    expect(block).toMatch(/drop constraint/)
    expect(block).toMatch(/alter column role_id drop not null/)
    // The drop must come first inside that block, which is the whole point.
    expect(block.indexOf("drop constraint")).toBeLessThan(
      block.indexOf("alter column role_id drop not null")
    )
  })

  it("finds the primary key by lookup, never by assuming its name", () => {
    // A table whose key was ever rebuilt by hand carries a different name,
    // and `drop constraint if exists <assumed name>` would match nothing,
    // succeed, and leave the next statement to fail confusingly.
    expect(sql).toMatch(/from pg_constraint/)
    expect(sql).toMatch(/contype = 'p'/)
    expect(sql).not.toMatch(/drop constraint if exists interview_settings_pkey/)
  })

  it("keeps at most one override per role AND one default per agency", () => {
    // Without the second index an agency could hold several conflicting
    // defaults and the resolver would pick whichever came back first.
    expect(sql).toMatch(/unique index[\s\S]*\(role_id\)[\s\S]*where role_id is not null/)
    expect(sql).toMatch(/unique index[\s\S]*\(agency_id\)[\s\S]*where role_id is null/)
  })

  it("refuses a row whose role belongs to another agency", () => {
    // Resolution filters on agency_id; without this a mis-stamped row would
    // let one tenant's override be read for another's role.
    expect(sql).toMatch(/does not belong to agency/)
    expect(sql).toMatch(/create trigger interview_settings_tenancy/)
  })

  it("grants the service role its writes explicitly", () => {
    // Three shipped tables were found unwritable by the role that writes
    // them because a grant to `authenticated` looked complete.
    expect(sql).toMatch(/grant select, insert, update, delete on agency\.interview_settings to service_role/)
  })
})
