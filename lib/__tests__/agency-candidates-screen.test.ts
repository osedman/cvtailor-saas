/**
 * The candidates screen, and the two nav rules the walk-through produced.
 *
 * The screen exists because the sidebar counted candidates from the first
 * build and the count was never a route: you reached a person only through
 * the role they were on, so somebody rejected for one role was invisible when
 * a second would have suited them.
 *
 * The rule that matters most: a rejected candidate is LISTED, never hidden,
 * and the decision is never allowed to become a rank or a filter applied for
 * you. The user narrowing their own view is fine; the product deciding who
 * you see is not.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
const page = read("app/agencies/candidates/page.tsx")
const api = read("app/api/agency/candidates/route.ts")
const nav = read("components/agency/agency-nav.tsx")
const dashboard = read("app/agencies/page.tsx")

describe("the candidates list", () => {
  it("asks for every candidate in the agency, not one role's", () => {
    expect(api).toMatch(/\.eq\("agency_id"/)
    expect(api).not.toMatch(/\.eq\("role_id"/)
  })

  it("never narrows the query by decision — rejected people are still listed", () => {
    // Filtering server-side would mean the product deciding who you see.
    expect(api).not.toMatch(/\.eq\("decision"/)
    expect(api).not.toMatch(/decision.*!==.*reject/)
  })

  it("orders by when somebody was added, never by score", () => {
    expect(api).toMatch(/\.order\("ingested_at"/)
    expect(api).not.toMatch(/\.order\("overall"|\.order\("score/)
  })

  it("keeps compliance answers out of the table entirely", () => {
    // Right to work, sponsorship and represent belong on the person. A
    // compliance column in a scannable list is one sort from being a filter
    // on people, which every guardrail in this schema exists to stop.
    for (const col of ["rtw_evidence", "rtw_sponsorship", "represent_status"]) {
      expect(api, `${col} must not reach the candidates list`).not.toContain(col)
      expect(page, `${col} must not reach the candidates list`).not.toContain(col)
    }
  })

  it("keeps an erased candidate visible as a fact rather than an absence", () => {
    expect(api).toContain("Erased at their request")
  })

  it("the filters narrow the user's own view, client-side", () => {
    expect(page).toMatch(/const shown = useMemo/)
    expect(page).toContain('"No decision"')
  })
})

describe("the nav, after the walk-through", () => {
  it("Candidates is a route now, not a scroll anchor", () => {
    // No /s flag — the tsconfig target predates it, and [\s\S] is the
    // portable equivalent. Same trap as the booking test this morning.
    expect(nav).toMatch(/key: "candidates"[\s\S]*href: "\/agencies\/candidates"/)
  })

  it("no page nests a section that just returns to its own top", () => {
    // "Today" scrolled to the top of the page the Dashboard item already
    // routes to: one destination, two names, the second leading nowhere new.
    const sections = dashboard.slice(dashboard.indexOf("sections={["))
    const block = sections.slice(0, sections.indexOf("]}"))
    expect(block).not.toContain('label: "Today"')
    expect(block).not.toContain('id: "top"')
  })

  it("Candidates is no longer duplicated as a dashboard section", () => {
    const sections = dashboard.slice(dashboard.indexOf("sections={["))
    const block = sections.slice(0, sections.indexOf("]}"))
    expect(block).not.toContain('label: "Candidates"')
  })
})

describe("adding a client", () => {
  const clients = read("app/agencies/clients/page.tsx")

  it("can be done on the screen named for it", () => {
    // It used to exist only inside a role's submission step, so a new agency
    // could not add its first client without opening a role.
    expect(clients).toContain("Add a client")
    expect(clients).toMatch(/fetch\("\/api\/agency\/contacts"[\s\S]{0,120}POST/)
  })

  it("adding does not grant access — that stays the invite's job", () => {
    const fn = clients.slice(clients.indexOf("async function addContact"))
    const body = fn.slice(0, fn.indexOf("\n  }"))
    expect(body).not.toMatch(/\/invite/)
    expect(clients).toContain("does not give them access")
  })
})
