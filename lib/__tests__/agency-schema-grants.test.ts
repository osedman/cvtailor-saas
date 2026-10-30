/**
 * Every table created in the `agency` schema must be granted explicitly.
 *
 * The `public` schema carries Supabase's default privileges, so a table
 * created there is reachable by service_role and authenticated the moment it
 * exists. The `agency` schema is ours and has no such defaults — a table
 * created there is owner-only until someone says otherwise.
 *
 * Migration 12 created agency.role_matching, enabled RLS and wrote a member
 * SELECT policy, and granted nothing. **An RLS policy is meaningless without
 * a grant underneath**: RLS narrows what a role may reach, it does not confer
 * the right to reach anything. The table sat unreadable and unwritable by
 * every role in the product until a recruiter clicked Publish and got
 * `permission denied for table role_matching [42501]` — after the snapshot
 * had already been written, leaving a half-published role.
 *
 * This is a source scan over the migrations: any migration that creates an
 * agency-schema table must also grant on it, somewhere in the tree.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

const DIR = join(process.cwd(), "supabase/migrations")

function allMigrations(): { file: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(DIR, file), "utf8") }))
}

/** Tables created in the agency schema, across every migration. */
function agencyTablesCreated(): Map<string, string> {
  const created = new Map<string, string>()
  for (const { file, sql } of allMigrations()) {
    const re = /create table (?:if not exists )?agency\.(\w+)/gi
    for (const m of sql.matchAll(re)) {
      if (!created.has(m[1])) created.set(m[1], file)
    }
  }
  return created
}

describe("agency schema grants", () => {
  const created = agencyTablesCreated()
  const everySql = allMigrations()
    .map((m) => m.sql)
    .join("\n")

  it("finds the agency tables at all", () => {
    expect(created.size).toBeGreaterThan(8)
    expect([...created.keys()]).toContain("role_matching")
  })

  it("grants on every table it creates", () => {
    /**
     * A SCHEMA-WIDE GRANT ONLY COVERS TABLES THAT ALREADY EXIST.
     *
     * Migration 1 runs `grant all on all tables in schema agency to
     * service_role`, and it is tempting — this test did it — to treat that as
     * blanket coverage. It is not: `GRANT ... ON ALL TABLES IN SCHEMA` is a
     * one-shot over the tables present at that moment, not a standing rule.
     * (`ALTER DEFAULT PRIVILEGES` is the standing version, and this schema
     * does not use it.) Reading it as blanket coverage is exactly how
     * role_matching shipped unreachable, and made the first draft of this
     * guard pass while the product was broken.
     *
     * So a schema-wide grant only counts for tables created in the SAME
     * migration or an earlier one.
     */
    const migrations = allMigrations()
    const schemaWideAt = migrations
      .filter((m) => /grant[\s\S]{0,120}on all tables in schema agency/i.test(m.sql))
      .map((m) => m.file)

    /**
     * Whole GRANT statements, not a character window. This repo grants
     * several tables at once —
     *
     *   grant select on agency.role_briefs,
     *                   agency.availability_slots,
     *                   ... 5 more ...
     *     to authenticated;
     *
     * — so a fixed lookahead from the word `grant` never reaches the table
     * listed fifth. The first draft of this test flagged eight healthy tables
     * for exactly that reason, which would have been worse than no test.
     * Function grants are excluded: they say nothing about table access.
     */
    const grantStatements = (everySql.match(/\bgrant\b[\s\S]*?;/gi) ?? []).filter(
      (g) => !/\bon\s+function\b/i.test(g)
    )

    const ungranted = [...created.entries()].filter(([table, createdIn]) => {
      const mentioned = new RegExp(`\\bagency\\.${table}\\b`, "i")
      if (grantStatements.some((g) => mentioned.test(g))) return false
      // Filenames are timestamp-prefixed, so string order is chronological.
      return !schemaWideAt.some((file) => file >= createdIn)
    })

    expect(
      ungranted.map(([t, f]) => `${t} (created in ${f})`),
      "an agency-schema table with no grant is unreachable by every role in the product — RLS narrows access, it does not confer it"
    ).toEqual([])
  })

  it("keeps role_matching audit-coupled: no client writes", () => {
    // The client may read its own agency's row; every write goes through a
    // service-role route that writes the audit_log row in the same operation.
    const grants = everySql.match(/grant[^;]*on agency\.role_matching[^;]*;/gi) ?? []
    expect(grants.length).toBeGreaterThan(0)
    const toAuthenticated = grants.filter((g) => /to[\s\S]*authenticated/i.test(g))
    for (const g of toAuthenticated) {
      expect(g.toLowerCase()).not.toMatch(/\b(insert|update|delete)\b/)
    }
  })
})
