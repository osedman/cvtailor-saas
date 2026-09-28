/**
 * Candidate detail: one component, one URL, two entrances.
 *
 * Opening somebody from compare should not cost you your place in compare —
 * that is what the modal is for. What it must not cost is the address. Step
 * 06 is one of the seven, it is the evidence record for a named person, and
 * it is the screen a recruiter is most likely to send to a colleague.
 *
 * A state-only modal would have broken three rules at once: deep linking
 * ("URLs should reflect current state for sharing"), back behaviour
 * (severity HIGH — back would leave the workflow instead of closing the
 * panel), and "modals must not be used for primary navigation flows".
 *
 * And this codebase has the scar: step 06 once fell out of a pane-derived
 * rail and went missing for four days. A modal with no route is the same
 * disappearance with a nicer animation.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const exists = (p: string) => existsSync(join(process.cwd(), p))

const PAGE = "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx"
const MODAL = "app/agencies/roles/[roleId]/@modal/(.)candidates/[candidateId]/page.tsx"
const SLOT_DEFAULT = "app/agencies/roles/[roleId]/@modal/default.tsx"
const LAYOUT = "app/agencies/roles/[roleId]/layout.tsx"
const SHARED = "components/agency/candidate-detail.tsx"

describe("the URL survives", () => {
  it("the real page still exists and is still a page", () => {
    // The intercept is an addition. If this ever becomes modal-only, a link
    // to a candidate stops resolving and step 06 stops being a place.
    expect(exists(PAGE)).toBe(true)
    expect(read(PAGE)).toMatch(/export default function CandidateDetailPage/)
  })

  it("the slot has a default, or the whole route 404s on a hard load", () => {
    // The classic way this pattern breaks: a parallel slot with no match and
    // no default.tsx takes the route down with it.
    expect(exists(SLOT_DEFAULT)).toBe(true)
    expect(read(SLOT_DEFAULT)).toMatch(/return null/)
  })

  it("the layout renders both children and the slot", () => {
    const l = read(LAYOUT)
    expect(l).toMatch(/modal: React\.ReactNode/)
    expect(l).toMatch(/\{children\}/)
    expect(l).toMatch(/\{modal\}/)
  })
})

describe("one component, two entrances", () => {
  it("both render the same thing", () => {
    for (const p of [PAGE, MODAL]) {
      expect(read(p), `${p} does not render CandidateDetail`).toMatch(/<CandidateDetail/)
    }
  })

  it("only the chrome differs", () => {
    const shared = read(SHARED)
    // In a modal you are already on the role and already in step 06.
    expect(shared).toMatch(/\{!inModal && <RoleHeader roleId=\{roleId\} hat="recruiter" \/>\}/)
    expect(shared).toMatch(/\{!inModal && \(/)
    expect(read(MODAL)).toMatch(/inModal/)
    // The page must NOT pass it — the page is the place.
    expect(read(PAGE)).not.toMatch(/inModal/)
  })
})

describe("three ways out, because a modal with one is a trap", () => {
  const modal = read(MODAL)

  it("Escape closes it", () => {
    expect(modal).toMatch(/e\.key === "Escape"/)
    expect(modal).toMatch(/addEventListener\("keydown", onKey\)/)
  })

  it("the backdrop closes it, and the panel does not", () => {
    expect(modal).toMatch(/className="ag-modal-scrim" onClick=\{close\}/)
    expect(modal).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/)
  })

  it("Back closes it, which is the whole point of the route", () => {
    // router.back() and not router.push: closing must unwind the history
    // entry the intercept created, or Back would leave the workflow.
    expect(modal).toMatch(/const close = useCallback\(\(\) => router\.back\(\)/)
  })

  it("it is a real dialog and gives focus back", () => {
    expect(modal).toMatch(/role="dialog"/)
    expect(modal).toMatch(/aria-modal="true"/)
    expect(modal).toMatch(/aria-label="Candidate detail"/)
    expect(modal).toMatch(/opener\.current = document\.activeElement/)
    expect(modal).toMatch(/opener\.current\?\.focus\?\.\(\)/)
  })

  it("the pane behind cannot scroll, and gets its scrolling back", () => {
    expect(modal).toMatch(/document\.body\.style\.overflow = "hidden"/)
    expect(modal).toMatch(/document\.body\.style\.overflow = previous/)
  })
})

describe("the panel is a panel", () => {
  const css = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")

  it("is fixed, so the slot never becomes a third column", () => {
    // .ag-app is display:flex. A slot in normal flow would squeeze the page.
    expect(css).toMatch(/\.ag-modal \{[^}]*position: fixed/)
  })

  it("paints on a real token", () => {
    // var(--ag-bg) does not exist in this stylesheet; it resolved to nothing
    // and the panel was transparent until this was caught.
    const panel = css.slice(css.indexOf(".ag-modal-panel {"))
    expect(panel.slice(0, 500)).toMatch(/background: var\(--ag-cream\)/)
    expect(css).not.toMatch(/var\(--ag-bg\)/)
  })

  it("becomes a sheet where a centred dialog would be a lie", () => {
    // Below 900px the sidebar is already display:none.
    expect(css).toMatch(/@media \(max-width: 900px\) \{\s*\.ag-modal \{ align-items: flex-end/)
  })

  it("its motion is optional", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]{0,200}ag-modal-in/)
  })
})
