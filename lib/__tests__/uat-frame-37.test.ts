/**
 * Frame 37 (approved 2 Oct 2026): compare dropdowns (UAT 17), every
 * screening question in one place with a call record (UAT 14), and
 * in-person interview details (UAT 20).
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { appendTrail, trailEvents, TRAIL_CAP, WRITTEN_KEY } from "../agency/call-trail"
import { resolveProbes } from "../agency/probes"
import { normalise } from "../agency/interview-rules"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const AT = "2026-10-02T10:00:00.000Z"
const text = (k: string) => ({ L03: "Why are they open to moving?", Qabcdef12: "Would they relocate?" } as Record<string, string>)[k] ?? null

describe("the call record (UAT 14)", () => {
  it("records a question put on the call, and its first answer", () => {
    const ev = trailEvents({}, { L03: "Redundancy" }, text, "u1", AT)
    expect(ev.map((e) => e.kind)).toEqual(["added", "answered"])
    expect(ev[1]).toMatchObject({ key: "L03", text: "Why are they open to moving?", answer: "Redundancy" })
  })

  it("an edit is an edit, an unchanged answer is nothing", () => {
    expect(trailEvents({ L03: "a" }, { L03: "a" }, text, "u1", AT)).toEqual([])
    expect(trailEvents({ L03: "a" }, { L03: "b" }, text, "u1", AT).map((e) => e.kind)).toEqual(["edited"])
    expect(trailEvents({ L03: "" }, { L03: "b" }, text, "u1", AT).map((e) => e.kind)).toEqual(["answered"])
  })

  it("a removed question keeps its answer in the record", () => {
    const [e] = trailEvents({ Qabcdef12: "Yes, for three months" }, {}, text, "u1", AT)
    expect(e).toMatchObject({ kind: "removed", text: "Would they relocate?", answer: "Yes, for three months" })
  })

  it("a key it cannot name is recorded by its key, not dropped", () => {
    expect(trailEvents({}, { R99: "" }, text, "u1", AT)[0]).toMatchObject({ key: "R99", text: "R99" })
  })

  it("appends, keeps the newest, and starts fresh on a malformed value", () => {
    const one = trailEvents({}, { L03: "" }, text, "u1", AT)
    expect(appendTrail({ not: "an array" }, one)).toHaveLength(1)
    const full = Array.from({ length: TRAIL_CAP }, () => one[0])
    const next = appendTrail(full, [{ ...one[0], key: "LAST" }])
    expect(next).toHaveLength(TRAIL_CAP)
    expect(next[next.length - 1].key).toBe("LAST")
  })

  it("the review route writes the record through appendTrail, only when the script changes", () => {
    const src = read("app/api/agency/candidates/[candidateId]/review/route.ts")
    const block = src.slice(src.indexOf('if ("call_answers" in body'), src.indexOf('if (body.status === "reviewed"'))
    expect(block).toMatch(/trailEvents\(before, answers/)
    expect(block).toMatch(/patch\.call_trail = appendTrail\(prior\?\.call_trail, events\)/)
  })

  it("the record stays with the recruiter: no client surface reads it", () => {
    const roots = ["app/api/hiring", "app/hiring", "app/portal", "app/api/portal", "app/booking"]
    const files: string[] = []
    const walk = (d: string) => {
      let names: string[] = []
      try { names = readdirSync(join(process.cwd(), d)) } catch { return }
      for (const n of names) {
        const p = `${d}/${n}`
        if (statSync(join(process.cwd(), p)).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(n)) files.push(p)
      }
    }
    roots.forEach(walk)
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(read(f), f).not.toMatch(/call_trail/)
    // The client document's focus line takes the questions, never the record.
    expect(read("app/api/agency/roles/[roleId]/submission/route.ts")).not.toMatch(/call_trail/)
  })
})

describe("written questions (UAT 14)", () => {
  it("their keys fit call_answers' 10-character cap", () => {
    expect(WRITTEN_KEY.test("Qabcdef12")).toBe(true)
    expect("Qabcdef12".length).toBeLessThanOrEqual(10)
    expect(WRITTEN_KEY.test("Q123")).toBe(false)
  })

  it("resolve to their text wherever answers are read", () => {
    expect(resolveProbes(["Qabcdef12"], [], [{ key: "Qabcdef12", text: "Would they relocate?" }])).toEqual([{ id: "Qabcdef12", text: "Would they relocate?" }])
    expect(read("components/agency/candidate-detail.tsx")).toMatch(/resolveProbes\(Object\.keys\(review\?\.call_answers \?\? \{\}\), requirements, written\)/)
    expect(read("app/api/agency/roles/[roleId]/submission/route.ts")).toMatch(/written\s*\)/)
  })

  it("every write is audit-coupled, and removing stamps rather than deletes", () => {
    const lib = read("lib/agency/screening-questions.ts")
    for (const m of ["addWrittenQuestion", "removeWrittenQuestion"]) {
      const body = lib.slice(lib.indexOf(`export async function ${m}`))
      expect(body.slice(0, body.indexOf("\nexport ") === -1 ? undefined : body.indexOf("\nexport ")), m).toMatch(/writeAudit\(/)
    }
    expect(lib).toMatch(/removed_at: new Date\(\)\.toISOString\(\)/)
    expect(lib).not.toMatch(/\.delete\(\)/)
  })

  it("a role question is on every call's list automatically (Ose, 2 Oct)", () => {
    const page = read("app/agencies/roles/[roleId]/page.tsx")
    expect(page).toMatch(/probeCatalogue\.filter\(\(q\) => q\.id in activeAnswers \|\| q\.source === "role"\)/)
  })

  it("the migration grants the browser SELECT only", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261002120000_screening_questions_and_venue.sql"), "utf8")
    expect(sql).toMatch(/grant select on agency\.screening_questions to authenticated;/)
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*screening_questions to authenticated/)
    expect(sql).toMatch(/check \(jsonb_typeof\(call_trail\) = 'array'\)/)
  })
})

describe("in-person interviews (UAT 20)", () => {
  it("keeps the floor or room and the arrival notes, bounded like the columns", () => {
    const s = normalise({ locationKind: "in_person", locationRoom: "x".repeat(200), arrivalNotes: "y".repeat(900) })
    expect(s.locationRoom).toHaveLength(120)
    expect(s.arrivalNotes).toHaveLength(600)
  })

  it("the address before confirming; floor and arrival notes only after", async () => {
    const { venueFor } = await import("../agency/booking")
    const rules = { locationKind: "in_person" as const, locationDetail: "1 Canada Square", locationRoom: "Floor 12", arrivalNotes: "Ask at reception" }
    expect(venueFor(rules, false)).toEqual({ kind: "in_person", address: "1 Canada Square", room: "", arrival: "" })
    expect(venueFor(rules, true)).toEqual({ kind: "in_person", address: "1 Canada Square", room: "Floor 12", arrival: "Ask at reception" })
    expect(venueFor({ ...rules, locationKind: "video" }, true)).toEqual({ kind: "video", address: "", room: "", arrival: "" })
  })

  it("the booking page no longer says 'Video call' whatever was chosen", () => {
    const page = read("app/booking/[token]/page.tsx")
    expect(page).toMatch(/booking\.venue\.kind === "in_person"/)
    expect(page).toMatch(/On arrival/)
  })

  it("the invite email and calendar file carry the address only", () => {
    const lib = read("lib/agency/booking.ts")
    expect(lib).toMatch(/const address = venueFor\(rules, false\)\.address/)
    expect(lib).toMatch(/\.\.\.\(address \? \{ location: address \} : \{\}\)/)
  })
})

describe("compare filters (UAT 17)", () => {
  const page = read("app/agencies/roles/[roleId]/page.tsx")
  it("are three labelled dropdowns", () => {
    for (const label of ["Sort by", "Requirements", "Candidates"]) expect(page).toContain(`<span className="ag-label">${label}</span>`)
    expect(page).not.toMatch(/Must-haves only<\/button>/)
  })
  it("only change the view — no decision is written by a filter", () => {
    const bar = page.slice(page.indexOf('className="ag-cmp-filters"'), page.indexOf('<div className="ag-legend">', page.indexOf('className="ag-cmp-filters"')))
    expect(bar).not.toMatch(/decide\(|addMany\(|fetch\(/)
  })
})
