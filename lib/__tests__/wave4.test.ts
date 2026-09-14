/**
 * Wave 4 — the two facts the loop was inferring.
 *
 * Both items were the same mistake in different places: the product decided
 * something important by reading around the edge of it.
 *
 *   1. Whether the client had finished deciding was read off the round count
 *      against planned_rounds — a plan next-action.ts's own header calls
 *      "a plan, never a gate".
 *   2. Whether a hire came through the process was not read at all, so a
 *      placement's fee and rebate window could be recorded against a
 *      candidate nobody ever advanced.
 *
 * Comments are stripped before every scan; the notes in these files name the
 * strings being scanned for.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const readSql = (p: string) => sqlCode(readFileSync(join(process.cwd(), p), "utf8"))

const nextAction = read("lib/agency/next-action.ts")
const completions = read("lib/agency/decision-completions.ts")
const placements = read("lib/agency/placements.ts")
const migration = readSql("supabase/migrations/20260913120000_wave4_decisions_complete_and_proxy_hire.sql")
const repair = readSql("supabase/migrations/20260914090000_wave4_repair_grants_and_null_safety.sql")

describe("a fact outranks an inference, and does not replace it", () => {
  it("the client's statement is consulted before the round count", () => {
    const fact = nextAction.indexOf("if (f.decisionsCompleteAt)")
    const derived = nextAction.indexOf('const closeOut = pick("close-out")')
    expect(fact, "the fact rung is missing").toBeGreaterThan(-1)
    expect(derived, "the derived rung is missing").toBeGreaterThan(-1)
    expect(fact).toBeLessThan(derived)
  })

  it("the derived rung survives, so nothing regresses without the button", () => {
    // The whole design: a role whose client never presses it behaves as
    // before. Deleting the derivation would break every existing role.
    expect(nextAction).toMatch(/if \(last\.roundNumber >= planned\) return \{ kind: "close-out"/)
  })

  it("since comes from the moment the client said so", () => {
    const rung = nextAction.slice(nextAction.indexOf("if (f.decisionsCompleteAt)"))
    expect(rung.slice(0, 700)).toMatch(/since: f\.decisionsCompleteAt/)
  })

  it("it does not pretend to know who was picked", () => {
    // The client said they were FINISHED, not who got the job. That is the
    // placement, and the receipt must not invent a name.
    const rung = nextAction.slice(nextAction.indexOf("if (f.decisionsCompleteAt)"))
    expect(rung.slice(0, 700)).toMatch(/candidateRef: done\?\.ref/)
    // "take-to-close-out" appears twice — once in the task switch and once
    // in the receipt switch. The receipt is the later one.
    const receipt = nextAction.slice(nextAction.lastIndexOf('case "take-to-close-out":'))
    expect(receipt.slice(0, 500)).toMatch(/confirmed: sub\.candidateRef/)
    expect(receipt.slice(0, 500)).toMatch(/has finished deciding/)
  })
})

describe("the completion is append-only and audit-coupled", () => {
  it("inserts, and never updates or deletes a prior row", () => {
    expect(completions).toMatch(/\.from\("role_decision_completions"\)\s*\n?\s*\.insert\(/)
    expect(completions).not.toMatch(/\.from\("role_decision_completions"\)[\s\S]{0,80}\.(update|delete)\(/)
  })

  it("a withdrawal resolves to null rather than to a timestamp", () => {
    // So a reopened role falls back to the derived rung on its own, with no
    // second state to keep in sync and nothing to clean up.
    expect(completions).toMatch(/row\.action === "completed" \? \(row\.created_at as string\) : null/)
  })

  it("newest wins, and earlier rows stay readable as history", () => {
    expect(completions).toMatch(/\.order\("created_at", \{ ascending: false \}\)/)
    expect(completions).toMatch(/if \(out\.has\(roleId\)\) continue/)
  })

  it("writes the audit row in the same operation", () => {
    expect(completions).toMatch(/await writeAudit\(/)
    expect(completions).toMatch(/"decisions_complete"/)
    expect(completions).toMatch(/"decisions_reopened"/)
  })

  it("proves the link in BOTH doors, not just one of them", () => {
    // Found by probe-mutation on 14 Sep 2026: asserting the check exists
    // "somewhere in the file" passed while the WRITER's copy was replaced
    // with `true`, because the reader's copy still matched. A guard that
    // one door can lose without failing is not guarding two doors.
    const writer = completions.slice(
      completions.indexOf("export async function recordDecisionCompletion"),
      completions.indexOf("export async function completionForHiringRole")
    )
    const reader = completions.slice(completions.indexOf("export async function completionForHiringRole"))
    expect(writer, "the writer must resolve the role first").toBeTruthy()
    for (const [name, body] of [["writer", writer], ["reader", reader]] as const) {
      expect(body, `${name} does not look up the link`).toMatch(/ctx\.links\.find\(/)
      expect(body, `${name} does not match the contact`).toMatch(
        /l\.contactId === \(role\.contact_id as string \| null\)/
      )
      expect(body, `${name} does not match the agency`).toMatch(/l\.agencyId === role\.agency_id/)
      expect(body, `${name} does not refuse an unlinked role`).toMatch(/if \(!link\) throw new AgencyAccessError/)
    }
  })

  it("the table has no authenticated write grants", () => {
    expect(migration).toMatch(/grant select on agency\.role_decision_completions to authenticated/)
    const authed = migration.match(/grant [^;]*to authenticated/g) ?? []
    for (const g of authed) expect(g).not.toMatch(/insert|update|delete/i)
  })

  it("closing is still nobody's side effect", () => {
    // Completion says the client is finished deciding. It must not touch the
    // role's status, because closing starts the retention clock.
    expect(completions).not.toMatch(/closed_at|status: "closed"/)
  })
})

describe("a hire that skipped the loop says so", () => {
  it("whether they advanced is derived, never accepted from the caller", () => {
    expect(placements).toMatch(/const advanced = await hasAdvanceDecision\(/)
    // The recruiter never ticks a box claiming it: there is no such input.
    const input = placements.slice(placements.indexOf("export interface PlacementInput"), placements.indexOf("export interface PlacementView"))
    expect(input).not.toMatch(/outsideProcess\b\s*[?:]/)
    expect(input).toMatch(/outsideProcessReason\?: string/)
  })

  it("only an advance decision counts", () => {
    const fn = placements.slice(placements.indexOf("export async function hasAdvanceDecision"))
    expect(fn.slice(0, 900)).toMatch(/\.eq\("decision", "advance"\)/)
    // No rounds at all is no advance decision either.
    expect(fn.slice(0, 900)).toMatch(/if \(roundIds\.length === 0\) return false/)
  })

  it("refuses the record rather than accepting an incomplete one", () => {
    expect(placements).toMatch(/if \(!advanced && !outsideReason\)/)
    expect(placements).toMatch(/travels with the record/)
  })

  it("sends NULL, not an empty string, when they did advance", () => {
    // placement_reason_iff_outside is enforced in BOTH directions: "" with
    // the flag false would be refused by Postgres.
    expect(placements).toMatch(/outside_process_reason: advanced \? null : outsideReason/)
    expect(placements).toMatch(/outside_process: !advanced/)
  })

  it("the audit log can tell one from the other", () => {
    expect(placements).toMatch(/"placement_recorded_outside_process"/)
  })
})

describe("the constraint actually refuses", () => {
  it("is NULL-safe, because a CHECK passes on NULL", () => {
    // The first migration shipped
    //   (outside_process = true and length(trim(outside_process_reason)) > 0)
    // With the reason NULL that expression is NULL, not false, and a CHECK
    // refuses only on FALSE — so the flag could be set with no reason, which
    // is the one thing it existed to prevent. Probed on the deployed schema:
    // refused flag-without-reason was `f`.
    expect(repair).toMatch(/coalesce\(outside_process_reason, ''\)/)
    const live = repair.slice(repair.indexOf("add constraint placement_reason_iff_outside"))
    expect(live).toMatch(/outside_process = false and outside_process_reason is null/)
    expect(live).toMatch(/outside_process = true and length\(trim\(coalesce\(/)
  })

  it("grants the role that actually writes the new table", () => {
    // agency.placements, round_decisions and candidate_compliance all carry
    // an explicit service_role grant; the first migration gave the new table
    // none, so every write would have failed at runtime while the mocked
    // tests stayed green. This project has shipped that twice.
    expect(repair).toMatch(/grant select, insert, update, delete on agency\.role_decision_completions to service_role/)
  })
})
