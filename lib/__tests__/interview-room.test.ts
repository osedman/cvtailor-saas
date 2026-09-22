/**
 * The interview room: a place with an address, and a door only the right
 * person can open.
 *
 * Built 17 September 2026 from Ose walking staging: "a pop-up window for each
 * candidate ... a distinct UI that helps the hire manager perform those rounds
 * and see the rounds." Figma frame 13, band B.
 *
 * THE GATE IS THE SUBMISSION, NOT THE ROLE, and that is the pin that matters
 * most here. A hiring manager holds a role; a recruiter may be interviewing
 * somebody on that role whom they never submitted — a bench candidate, a
 * second wave, somebody being met speculatively. Opening a room on "there is
 * a round on a role you hold" would disclose that person's existence. The gate
 * is getClientShortlist: a submission snapshot addressed to one of the
 * caller's own contact ids, which is the same door the shortlist screen uses.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const exists = (p: string) => existsSync(join(process.cwd(), p))

const LIB = "lib/agency/interview-room.ts"
const ROUTE = "app/api/hiring/roles/[roleId]/rounds/[candidateRef]/route.ts"
const UI = "components/agency/interview-room.tsx"
const PAGE = "app/hiring/roles/[roleId]/rounds/[candidateRef]/page.tsx"
const MODAL = "app/hiring/roles/[roleId]/@modal/(.)rounds/[candidateRef]/page.tsx"
const SLOT = "app/hiring/roles/[roleId]/@modal/default.tsx"
const LAYOUT = "app/hiring/roles/[roleId]/layout.tsx"

describe("the room is a place, not a pop-up", () => {
  it("the real page exists and answers a cold load", () => {
    // Without this the URL is decoration: a refresh mid write-up would 404.
    expect(exists(PAGE)).toBe(true)
  })

  it("the intercept exists, and so does the slot's default", () => {
    expect(exists(MODAL)).toBe(true)
    // A parallel slot with no default 404s the whole route on a hard
    // navigation — the classic way this pattern breaks.
    expect(exists(SLOT)).toBe(true)
    expect(exists(LAYOUT)).toBe(true)
  })

  it("both entrances render the same component", () => {
    expect(read(PAGE)).toMatch(/<InterviewRoom /)
    expect(read(MODAL)).toMatch(/<InterviewRoom /)
  })

  it("only the chrome differs", () => {
    expect(read(MODAL)).toMatch(/inModal/)
    expect(read(PAGE)).not.toMatch(/inModal/)
  })

  it("has three ways out, because a modal with one is a trap", () => {
    const m = read(MODAL)
    expect(m).toMatch(/e\.key === "Escape"/)   // Escape
    expect(m).toMatch(/ag-modal-scrim" onClick=\{close\}/) // the backdrop
    expect(m).toMatch(/router\.back\(\)/)       // the browser's own Back
  })

  it("gives focus back and unlocks the pane behind", () => {
    const m = read(MODAL)
    expect(m).toMatch(/opener\.current\?\.focus\?\.\(\)/)
    expect(m).toMatch(/document\.body\.style\.overflow = previous/)
  })
})

describe("the door only opens for somebody you were sent", () => {
  const lib = read(LIB)

  it("gates on the submission, not on the role", () => {
    expect(lib).toMatch(/getClientShortlist\(ctx, roleId\)/)
    expect(lib).toMatch(/if \(!shortlist\) return null/)
  })

  it("and refuses a candidate who was not on that shortlist", () => {
    // Sent A and B, asks for C: the snapshot is the list of who was sent.
    expect(lib).toMatch(/if \(!entry\) return null/)
  })

  it("reads the person out of the frozen snapshot, never the live row", () => {
    // What the client sees is what the client was sent. Reading candidates
    // directly here would widen disclosure by accident the next time that
    // table grows a column.
    expect(lib).toMatch(/snapshot\.shortlisted/)
    // The candidates table IS read — for the id alone, to find the rounds.
    // What it must never supply is anything ABOUT the person: name, title and
    // narrative come from the frozen snapshot, so this cannot widen the day
    // that table grows a column.
    expect(lib).toMatch(/\.from\("candidates"\)\s*\.select\("id"\)/)
    expect(lib).not.toMatch(/\.select\("id, full_name|candidate\.full_name|candidate\.current_title/)
    for (const field of ["fullName", "currentTitle", "narrative", "strengths", "gaps"]) {
      expect(lib, field).toMatch(new RegExp(`${field}: (str|strList|num)\\(entry\\.`))
    }
  })

  it("scopes rounds to the caller's own contact ids", () => {
    expect(lib).toMatch(/\.in\("contact_id", contactIds\)/)
  })

  it("answers 404, not 403, when there is no room", () => {
    // "Never sent to you" and "does not exist" must look identical from
    // outside, or the difference confirms somebody exists.
    expect(read(ROUTE)).toMatch(/status: 404/)
  })
})

describe("the write-up gates the decision", () => {
  const ui = read(UI)

  it("reads the gate from the server, not from component state alone", () => {
    // A client who wrote one up and reloaded used to get an empty box and no
    // way through. A reload is the test.
    expect(ui).toMatch(/current\?\.hasDebrief \|\| justWritten/)
  })

  it("the decision buttons are closed until it is written", () => {
    expect(ui).toMatch(/disabled=\{!written \|\| busy !== null\}/)
  })

  it("and says so in words, not only by disabling", () => {
    expect(ui).toMatch(/OPENS WHEN THE WRITE-UP IS SAVED/)
  })
})

describe("the draft survives", () => {
  const ui = read(UI)

  it("is kept per round, so two candidates cannot collide", () => {
    expect(ui).toMatch(/const draftKey = \(roundId: string\)/)
  })

  it("is written as they type and restored when the room opens", () => {
    expect(ui).toMatch(/localStorage\.setItem\(draftKey/)
    expect(ui).toMatch(/localStorage\.getItem\(draftKey/)
  })

  it("is cleared once it has become a record", () => {
    // Otherwise it resurfaces on the next round as if it were about them.
    expect(ui).toMatch(/localStorage\.removeItem\(draftKey/)
  })

  it("never lets storage being off break the box", () => {
    // A private window is not a reason to fail.
    const reads = ui.split("localStorage").length - 1
    const catches = ui.split("catch").length - 1
    expect(catches).toBeGreaterThanOrEqual(reads - 1)
  })
})

describe("the plan is the role's number, never a literal", () => {
  it("travels with the round", () => {
    expect(read("lib/agency/client-auth.ts")).toMatch(/planned_rounds: rolePlanned\.get/)
    expect(read("lib/agency/types.ts")).toMatch(/planned_rounds: number/)
  })

  it("and no screen hardcodes it any more", () => {
    // Both hiring-manager screens passed planned={2} while the role carried a
    // real number, so a three-round process was told it was on its last.
    for (const p of ["app/hiring/roles/[roleId]/round/[n]/page.tsx", "app/hiring/roles/[roleId]/decision/page.tsx"]) {
      expect(read(p)).not.toMatch(/planned=\{2\}/)
    }
  })

  it("the room compares against it rather than assuming two", () => {
    expect(read(LIB)).toMatch(/owed\.roundNumber >= plannedRounds/)
  })

  it("but the plan is still never a gate", () => {
    // next-action.ts is explicit that the count is "never a gate". The room
    // may say this was the last planned round; it must not refuse another.
    const ui = read(UI)
    expect(ui).not.toMatch(/disabled=\{.*atFinalRound/)
    expect(ui).toMatch(/you can still ask them for another round/i)
  })
})

describe("what the room deliberately does not do", () => {
  const ui = read(UI)

  it("claims no second interviewer, because the schema cannot say it", () => {
    // round_artifacts.round_id is UNIQUE — one write-up per round, no author.
    // The Figma frame promised "Priya has not written hers yet"; the data
    // model cannot state it, and inventing it would be worse than omitting it.
    expect(ui).not.toMatch(/has not written|second interviewer|other interviewer/i)
  })

  it("records nobody", () => {
    expect(ui).not.toMatch(/transcript|recording|capture/i)
  })

  it("never removes anyone", () => {
    expect(ui).toMatch(/Nobody is removed by any of these/)
    expect(ui).not.toMatch(/reject|remove from shortlist/i)
  })
})
