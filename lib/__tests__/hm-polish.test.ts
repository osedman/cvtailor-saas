/**
 * Board 32 · polish for the hiring manager (approved 29 Sep 2026).
 *
 * Pins the rules the board promised, the ones a later tidy-up would most
 * easily undo: a hint is a button with a described-by sentence; the hidden
 * bubble takes no width (it widened every phone page by 47px once); a
 * disabled save says why; the round card leads with the person; and on
 * phones the theme switch lives in the rail, never floating over a button.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { HINTS } from "@/components/agency/hint"

const root = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("Hint", () => {
  const src = tsCode(read("components/agency/hint.tsx"))

  it("is a button described by its sentence, so keyboard and screen readers get both", () => {
    expect(src).toMatch(/<button[\s\S]*aria-describedby=\{id\}/)
    expect(src).toMatch(/role="tooltip" id=\{id\}/)
  })

  it("opens on hover, focus AND tap — hover does not exist on a phone", () => {
    for (const h of ["onMouseEnter", "onFocus", "onClick"]) expect(src).toContain(h)
  })

  it("closes on Escape and on a tap elsewhere", () => {
    expect(src).toMatch(/e\.key === "Escape"/)
    expect(src).toMatch(/pointerdown/)
  })

  it("every sentence is one job and never a new fact about the person", () => {
    for (const [k, v] of Object.entries(HINTS)) {
      expect(v.length, k).toBeLessThan(220)
      expect(v, k).not.toMatch(/predicts|will succeed|personality|confidence/i)
    }
    expect(HINTS.fit).toMatch(/Not a prediction about the person/)
    expect(HINTS.decline).toMatch(/never a removal/)
  })
})

describe("the stylesheet holds the layout promises", () => {
  const ag = read("app/agencies/agencies.css")
  const hm = read("app/hiring/hiring.css")

  it("a closed hint bubble takes no width", () => {
    const rule = ag.slice(ag.indexOf(".ag-hint-bubble {"), ag.indexOf(".ag-hint.is-flip"))
    expect(rule).toMatch(/width: 0/)
    expect(rule).toMatch(/visibility: hidden/)
  })

  it("the board-32 CSS sits ABOVE the board-26 block, whose guardrail scans to end of file", () => {
    expect(ag.indexOf("Hints — board 32")).toBeLessThan(ag.indexOf("STEP 05 · THE SHORTLIST RAIL AND THE ONE VERB"))
  })

  it("on phones the rail carries the theme switch and the floating one is hidden", () => {
    expect(hm).toMatch(/\.ag-app:has\(\.hm-rail\) > \.ag-theme-toggle \{ display: none; \}/)
    expect(hm).toMatch(/\.hm-rail-theme \{ display: none; \}/)
  })

  it("buttons are pills that hug their label; the accent is coral", () => {
    expect(ag).toMatch(/\.agd-tbtn \{[^}]*border-radius: 999px/)
    expect(ag).toMatch(/\.agd-tbtn\.accent \{[^}]*var\(--ag-coral\)/)
  })
})

describe("the round card", () => {
  const src = tsCode(read("components/agency/hm-shared.tsx"))

  it("leads with the person, not the page title", () => {
    const head = src.slice(src.indexOf('className="hm-round-head"'), src.indexOf("{caseSlot}"))
    expect(head).toMatch(/hm-round-name/)
    expect(head).not.toMatch(/round\.role_title/)
  })

  it("a disabled save says what unlocks it", () => {
    expect(src).toMatch(/agd-tbtn-why/)
    expect(src).toMatch(/Write what happened first/)
  })

  it("the status pill is a Hint, never a bare pill", () => {
    const head = src.slice(src.indexOf('className="hm-round-state"'), src.indexOf("{caseSlot}"))
    expect(head).not.toMatch(/<span className="ag-pill/)
    expect((head.match(/<Hint/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe("the round page says the unconfirmed note once, and Decision asks one question at a time", () => {
  it("note once per section", () => {
    const page = tsCode(read("app/hiring/roles/[roleId]/round/[n]/page.tsx"))
    expect((page.match(/has not confirmed/g) ?? []).length).toBe(1)
    expect(page).toMatch(/owed\.some\(\(r\) => r\.status === "scheduled"\)/)
  })
  it("'That's all my decisions' waits for the final choice", () => {
    const page = tsCode(read("app/hiring/roles/[roleId]/decision/page.tsx"))
    expect(page).toMatch(/\(forward\.length === 0 \|\| choiceSent\)/)
  })
})
