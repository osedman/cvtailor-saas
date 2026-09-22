/**
 * The six ways out, and the lines they must not cross (22 Sep 2026).
 *
 * A survey found six things a user could create and never remove. Adding a
 * delete to a schema built on attribution is the easy half; the half that
 * costs something is the refusals — and a mocked test of a refusal agrees
 * with whatever the code already does, which is how two real bugs shipped
 * green on this repo. So these are scans and SQL reads: structural promises,
 * checked against the source and the migration rather than against a double
 * that would answer however it was told to.
 *
 * What each one is protecting:
 *   · discard is not close        — close starts retention and tells people
 *   · archive is not delete       — RESTRICT holds the attribution trail
 *   · void is not "declined"      — an outcome is a fact about a person
 *   · a delivered pack is sealed  — the client has it
 *   · a sent email cannot be unsent
 *   · a reference given belongs to the referee
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Comments state the rules; scanning them would be scanning our own prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const sql = (src: string) => src.replace(/^\s*--.*$/gm, "")

const migration = sql(read("supabase/migrations/20260922120000_agency_soft_deletes.sql"))
const db = code(read("lib/agency/db.ts"))

/** A function's own text, ending at the next top-level export — never a
 *  character count, which reads the next function's guards as its own. */
const fnBody = (src: string, marker: string): string => {
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`not found: ${marker}`)
  const next = src.indexOf("\nexport ", start + marker.length)
  return src.slice(start, next === -1 ? src.length : next)
}
const placements = code(read("lib/agency/placements.ts"))
const handover = code(read("lib/agency/handover.ts"))
const references = code(read("lib/agency/references.ts"))
const matched = code(read("lib/agency/matched-people.ts"))
const contacts = code(read("app/api/agency/contacts/route.ts"))

describe("the reason columns cannot be dodged by a NULL", () => {
  /**
   * A CHECK refuses only on FALSE, and NULL is not FALSE.
   * `placement_reason_iff_outside` shipped with exactly this hole on 14 Sep:
   * `flag = true and length(trim(reason)) > 0` is NULL when the reason is
   * NULL, so `false or NULL` is NULL and the row was ACCEPTED — the one
   * thing the constraint existed to prevent.
   */
  it.each(["discard_reason", "void_reason"])("wraps %s in coalesce", (column) => {
    const uses = migration.split("\n").filter((l) => l.includes(column) && l.includes("length(trim("))
    expect(uses.length).toBeGreaterThan(0)
    for (const line of uses) expect(line).toMatch(/coalesce\(/)
  })

  it("states both directions — set with no reason, and a reason with nothing set", () => {
    for (const c of ["job_roles_discard_reason_iff_discarded", "placements_void_reason_iff_voided", "handover_packs_void_reason_iff_voided"]) {
      const block = migration.slice(migration.indexOf(c))
      expect(block).toMatch(/is null and coalesce\(/)
      expect(block).toMatch(/is not null and length\(trim\(coalesce\(/)
    }
  })

  it("treats a whitespace-only reason as no reason", () => {
    expect(migration.match(/length\(trim\(coalesce\(/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe("a delivered handover pack is sealed", () => {
  it("is refused by the database, not only by the route", () => {
    expect(migration).toMatch(/handover_packs_void_undelivered_only[\s\S]{0,200}voided_at is null or delivered_at is null/)
  })

  it("is refused by voidHandoverPack, with the reason said out loud", () => {
    const fn = fnBody(handover, "export async function voidHandoverPack")
    expect(fn).toMatch(/delivered_at/)
    expect(fn).toMatch(/AgencyAccessError/)
  })

  it("guards the write against a delivery that lands mid-call", () => {
    const fn = fnBody(handover, "export async function voidHandoverPack")
    const update = fn.slice(fn.indexOf(".update("))
    expect(update).toMatch(/\.is\("delivered_at", null\)/)
    expect(update).toMatch(/\.is\("voided_at", null\)/)
  })

  it("does not re-attach to a voided pack when generating the next one", () => {
    const fn = fnBody(handover, "export async function generateHandoverPack")
    expect(fn.slice(0, fn.indexOf("const draftId"))).toMatch(/\.is\("voided_at", null\)/)
  })
})

describe("discarding a role is not closing it", () => {
  it("refuses once anyone is on the role", () => {
    const fn = fnBody(db, "export async function discardJobRole")
    expect(fn).toMatch(/candidates/)
    expect(fn).toMatch(/submissions/)
    expect(fn).toMatch(/close it instead/)
  })

  it("never touches status, closed_at or retention", () => {
    const fn = fnBody(db, "export async function discardJobRole")
    const update = fn.slice(fn.indexOf(".update("), fn.indexOf(".update(") + 300)
    expect(update).not.toMatch(/status|closed_at|retention/)
  })

  it("leaves every list of roles", () => {
    expect(fnBody(db, "export async function listJobRoles")).toMatch(/\.is\("discarded_at", null\)/)
  })
})

describe("voiding a placement is not declining it", () => {
  it("writes no status — an outcome is a fact about a person", () => {
    const fn = fnBody(placements, "export async function voidPlacement")
    const update = fn.slice(fn.indexOf(".update("), fn.indexOf(".update(") + 300)
    expect(update).toMatch(/voided_at/)
    expect(update).not.toMatch(/status/)
    expect(update).not.toMatch(/declined|fell_through/)
  })

  /**
   * Sliced to the function, NOT to a character count. The first cut of this
   * test took 1600 characters from getPlacementForCandidate, which ran on
   * into listPlacementsForRole and read ITS guard: deleting the guard under
   * test left the suite green. Found by probe-mutating it, which is the only
   * way a scan like this earns any trust.
   */
  it("leaves every read, so it leaves every number", () => {
    for (const marker of ["export async function getPlacementForCandidate", "export async function listPlacementsForRole"]) {
      expect(fnBody(placements, marker)).toMatch(/\.is\("voided_at", null\)/)
    }
  })

  it("audits under an entity type the constraint actually allows", () => {
    const fn = fnBody(placements, "export async function voidPlacement")
    expect(fn).toMatch(/entityType: "candidate"/)
    expect(fn).not.toMatch(/entityType: "placement"/)
  })
})

describe("a referee who has been written to is withdrawn, not deleted", () => {
  const fn = fnBody(references, "export async function removeReferee")

  it("deletes only while nothing has been sent, guarded on the notice", () => {
    const del = fn.slice(fn.indexOf(".delete()"))
    expect(del).toMatch(/\.is\("notice_sent_at", null\)/)
  })

  it("keeps a reference that has already been given", () => {
    expect(fn).toMatch(/received_at/)
    expect(fn).toMatch(/stays on the record/)
  })

  it("says which of the two happened rather than claiming a deletion", () => {
    expect(fn).toMatch(/outcome: contacted \? "withdrawn" : "deleted"/)
  })
})

describe("archiving a contact keeps the attribution", () => {
  it("never deletes the row", () => {
    const fn = contacts.slice(contacts.indexOf("export async function DELETE"))
    expect(fn).toMatch(/archived_at/)
    expect(fn).not.toMatch(/\.delete\(\)/)
  })

  it("does not silently revoke their access", () => {
    const fn = contacts.slice(contacts.indexOf("export async function DELETE"))
    expect(fn).not.toMatch(/revoked_at|client_invites|client_links/)
  })

  it("leaves the address book read", () => {
    expect(contacts.slice(contacts.indexOf("export async function GET"), contacts.indexOf("export async function POST")))
      .toMatch(/\.is\("archived_at", null\)/)
  })
})

describe("withdrawing an invitation is not un-asking someone who applied", () => {
  const fn = fnBody(matched, "export async function withdrawMatchedInvite")

  it("refuses once they have applied", () => {
    expect(fn).toMatch(/applied/)
    expect(fn).toMatch(/AgencyAccessError/)
  })

  it("guards the write so an application mid-call survives", () => {
    expect(fn.slice(fn.indexOf(".update("))).toMatch(/\.eq\("state", "invited"\)/)
  })

  it("puts the state back rather than deleting the recommendation", () => {
    expect(fn).toMatch(/state: "seen"/)
    expect(fn).not.toMatch(/\.delete\(\)/)
  })
})

describe("what stays undeletable", () => {
  it("adds no delete path for candidates, decisions, members or audit rows", () => {
    expect(migration).not.toMatch(/alter table agency\.(candidates|round_decisions|client_actions|members|audit_log)/)
  })
})
