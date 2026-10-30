/**
 * The audit entity-type union and the database constraint, kept in step
 * MECHANICALLY.
 *
 * Migration 8 added 'member' to audit_log's check constraint. Migration 10
 * rebuilt the same constraint to add the client-actor values — starting from
 * migration 1's list instead of the deployed one — and silently dropped
 * 'member'. From 13 Aug to 15 Aug, adding a recruiter to a team inserted the
 * member row and then THREW at the audit step: the route 500'd, the invite
 * email never went, and the member existed anyway. The comment in types.ts
 * saying "keep the two in step" was advice; this test is enforcement.
 *
 * Mechanism: parse the union out of types.ts, find the NEWEST migration that
 * rebuilds the constraint, and require every union value to appear in it. A
 * new entity type without a migration fails; a rebuilt list that drops a
 * value fails.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

const ROOT = process.cwd()

function unionValues(): string[] {
  const source = readFileSync(join(ROOT, "lib/agency/types.ts"), "utf8")
  const start = source.indexOf("entityType:")
  const end = source.indexOf("entityRef:", start)
  const slice = source.slice(start, end)
  const values = [...slice.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1])
  return values
}

function newestConstraintMigration(): { file: string; sql: string } {
  const dir = join(ROOT, "supabase/migrations")
  const rebuilds = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes("audit_log_entity_type_check"))
    .sort() // timestamp-prefixed names sort chronologically
  const file = rebuilds[rebuilds.length - 1]
  return { file, sql: readFileSync(join(dir, file), "utf8") }
}

describe("audit entity types", () => {
  const values = unionValues()

  it("parses a believable union out of types.ts", () => {
    expect(values.length).toBeGreaterThan(10)
    expect(values).toContain("role")
    expect(values).toContain("member")
    expect(values).toContain("matching")
  })

  it("the newest constraint migration carries EVERY union value", () => {
    const { file, sql } = newestConstraintMigration()
    // Only the constraint body, so a value mentioned in a comment cannot
    // satisfy the check.
    const body = sql.slice(sql.lastIndexOf("audit_log_entity_type_check"))
    const closeParen = body.indexOf("));")
    const constraint = body.slice(0, closeParen)
    const missing = values.filter((v) => !constraint.includes(`'${v}'`))
    expect(missing, `${file} is missing: ${missing.join(", ")} — a rebuilt constraint must start from the FULL deployed list, not migration 1's`).toEqual([])
  })
})
