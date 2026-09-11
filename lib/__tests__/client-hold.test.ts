/**
 * Hold, and the persistent action bar (11 Sep 2026, Ose's step 1).
 *
 * Hold is the decision a client who is unsure would otherwise have to
 * express as a decline — which is the wrong signal entirely and reaches the
 * candidate as a closed door. It is also the reserve that invitation waves
 * will run on.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"
import { CLIENT_DECISIONS } from "../agency/client-shortlist"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const sql = sqlCode(readFileSync(join(process.cwd(), "supabase/migrations/20260911090000_client_action_hold.sql"), "utf8"))

describe("hold", () => {
  it("is one of the three decisions, in code and in the database", () => {
    expect(CLIENT_DECISIONS).toEqual(["interview", "hold", "decline"])
    const decl = sql.slice(sql.indexOf("add constraint client_actions_action_check"))
    expect(decl).toMatch(/'hold'/)
  })

  it("keeps the portal's own verbs — rebuilt from the deployed list", () => {
    // A rebuild that started from the original list once silently dropped a
    // value elsewhere; every action already recorded must still validate.
    const decl = sql.slice(sql.indexOf("add constraint client_actions_action_check"))
    for (const v of ["interview", "approve", "decline", "question", "hold"]) {
      expect(decl, v).toContain(`'${v}'`)
    }
  })

  it("removes nobody: it is a signal on a submission like the others", () => {
    const src = read("lib/agency/client-shortlist.ts")
    expect(src).not.toMatch(/\.delete\(\)/)
    expect(src).not.toMatch(/from\("candidates"\)\.update/)
    // The same insert path as every other client action.
    expect(src).toMatch(/from\("client_actions"\)\.insert\(\{[\s\S]{0,200}action: d\.action/)
  })

  it("is validated by the one list, not by a second copy of it", () => {
    expect(read("lib/agency/client-shortlist.ts")).toMatch(/!CLIENT_DECISIONS\.includes\(d\.action\)/)
    expect(read("app/api/hiring/roles/[roleId]/decisions/route.ts")).toMatch(/CLIENT_DECISIONS\.includes/)
  })

  it("only the interviewed are invited — a hold is not a cohort member", () => {
    const page = read("app/hiring/roles/[roleId]/interviews/page.tsx")
    expect(page).toMatch(/filter\(\(\[, c\]\) => c === "interview"\)/)
    expect(page).toMatch(/candidateRefs: chosen/)
  })
})

describe("the action bar", () => {
  const page = read("app/hiring/roles/[roleId]/interviews/page.tsx")

  it("is persistent, and carries the count and the single act", () => {
    expect(page).toMatch(/className="hm-actionbar"/)
    expect(page).toMatch(/candidate\$\{chosen\.length === 1 \? "" : "s"\} selected/)
    expect(page).toMatch(/Invite \$\{chosen\.length\} to interview/)
    const css = readFileSync(join(process.cwd(), "app/hiring/hiring.css"), "utf8")
    const rule = css.slice(css.indexOf(".hm-actionbar {"))
    expect(rule.slice(0, 400)).toMatch(/position: sticky/)
  })

  it("says what is still undecided rather than only what is chosen", () => {
    expect(page).toMatch(/still to decide/)
  })

  it("can save decisions even when nobody is being interviewed", () => {
    // A client whose answer is "none of these" still has something to record.
    expect(page).toMatch(/chosen\.length === 0 && held === 0 && declined === 0/)
    expect(page).toMatch(/Save these decisions/)
  })
})
