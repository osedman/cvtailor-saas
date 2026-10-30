/**
 * The handover checklist (smooth-flow plan, Wave 4). Source scans pin the
 * lines that matter: the gate is the server's, a waiver needs a reason,
 * nothing is auto-completed, and the audit records shape not content.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"
import { CHECKLIST } from "../agency/handover-checklist"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("the checklist itself", () => {
  it("is five items, four settled by the record and one by the recruiter's word", () => {
    expect(CHECKLIST.map((c) => c.key)).toEqual(["references", "right_to_work", "placement", "start_date", "terms"])
    expect(CHECKLIST.find((c) => c.key === "terms")?.derivedFrom).toMatch(/your word/)
  })
})

describe("the gate", () => {
  it("delivery refuses while anything is open, before the pack is updated", () => {
    const src = read("lib/agency/handover.ts")
    const gate = src.indexOf("await assertChecklistComplete(ctx, pack.role_id as string, pack.candidate_id as string)")
    const update = src.indexOf('.update({ delivered_at: new Date().toISOString(), delivered_to_contact_id: contactId })')
    expect(gate).toBeGreaterThan(-1)
    expect(update).toBeGreaterThan(gate)
  })
  it("names the outstanding items in the refusal", () => {
    const src = read("lib/agency/handover-checklist.ts")
    expect(src).toMatch(/the handover checklist is not complete: \$\{outstanding\.map/)
  })
})

describe("resolutions", () => {
  const src = read("lib/agency/handover-checklist.ts")
  it("a waiver or not-applicable needs a reason, in code and in the schema", () => {
    expect(src).toMatch(/if \(input\.state !== "done" && reason\.length === 0\) throw new AgencyAccessError/)
    const sql = sqlCode(readFileSync(join(process.cwd(), "supabase/migrations/20260905110000_handover_checklist.sql"), "utf8"))
    expect(sql).toMatch(/check \(state = 'done' or length\(btrim\(reason\)\) > 0\)/)
  })
  it("an item the record settles cannot be resolved by hand", () => {
    expect(src).toMatch(/if \(current\?\.derived\) throw new AgencyAccessError/)
  })
  it("the audit records shape, not the reason's content", () => {
    expect(src).toMatch(/toValue: \{ item: input\.item, state: input\.state, has_reason: reason\.length > 0 \}/)
    expect(src).not.toMatch(/toValue: \{[^}]*\breason: reason\b/)
  })
  it("the table has no authenticated write grants and an explicit service-role grant", () => {
    const sql = sqlCode(readFileSync(join(process.cwd(), "supabase/migrations/20260905110000_handover_checklist.sql"), "utf8"))
    expect(sql).toMatch(/grant select on agency\.handover_items to authenticated/)
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^\n]*to authenticated/)
    expect(sql).toMatch(/grant select, insert, update, delete on agency\.handover_items to service_role/)
  })
})

describe("close-out", () => {
  const src = read("app/agencies/roles/[roleId]/close-out/page.tsx")
  it("disables hand-over until the checklist is complete, and says what is outstanding", () => {
    expect(src).toMatch(/disabled=\{busy \|\| !checklistComplete\}/)
    expect(src).toMatch(/title=\{checklistComplete \? undefined : `Outstanding: \$\{checklistOutstanding/)
  })
  it("never auto-completes an item on delivery", () => {
    expect(src).not.toMatch(/state: "done"[^\n]*deliver/)
    expect(read("lib/agency/handover.ts")).not.toMatch(/handover_items/)
  })
})
