/**
 * Board 29 (Figma node 571:2, approved by Ose on 28 Sep 2026, with "show
 * names for unanswered too"): the hiring manager's Shortlist stage shows who
 * is being shortlisted, by name, as it happens — before any submission, and
 * as "added since" after one — and the recruiter's rail says so where the
 * adding happens.
 *
 * The bands render to static HTML (react-dom/server, as brief-jd-ui.test.ts
 * does); the fetch-and-refresh wiring and the page's branching are source
 * scans over comment-stripped code, per the repo's habit.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { tsCode } from "./helpers/source-scan"
import {
  AddedSince,
  BeingShortlisted,
  NothingShortlistedYet,
  ShortlistingRows,
  SHORTLISTING_REFRESH_MS,
  addedLabel,
  initialsOf,
  nextShortlistingState,
  outcomeOfStatus,
  shortlisterName,
  type ShortlistingState,
} from "../../components/agency/hm-shortlisting"
import { distinctAgencyCount } from "../../components/agency/hm-room"
import { ShortlistRail } from "../../components/agency/shortlist-rail"
import type { ShortlistingEntry } from "../agency/client-shortlisting"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const COMPONENT = tsCode(read("components/agency/hm-shortlisting.tsx"))
const PAGE = tsCode(read("app/hiring/roles/[roleId]/shortlist/page.tsx"))
const AGENCY_PAGE = tsCode(read("app/agencies/roles/[roleId]/page.tsx"))

// Fixed clock: 28 Sep 2026, midday local.
const NOW = new Date(2026, 8, 28, 12, 0, 0).getTime()
const today = new Date(2026, 8, 28, 9, 30).toISOString()
const yesterday = new Date(2026, 8, 27, 16, 0).toISOString()
const earlier = new Date(2026, 8, 24, 10, 0).toISOString()

const AGENCY = shortlisterName({ agencyName: "Halcyon Search", agencyCount: 1 })

const ENTRIES: ShortlistingEntry[] = [
  { ref: "CAN-01", name: "Amara Okonkwo", withheld: null, addedAt: earlier },
  { ref: "CAN-04", name: "Tomasz Wierzbicki", withheld: null, addedAt: yesterday },
  // Unanswered, now named (SHOW_NAMES_BEFORE_PERMISSION is on).
  { ref: "CAN-20", name: "Nadia Hussain", withheld: null, addedAt: today },
  { ref: "CAN-07", name: null, withheld: "asked_to_be_withheld", addedAt: today },
]

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/<!-- -->/g, "")

describe("A · before any submission, with people shortlisted", () => {
  const out = html(createElement(BeingShortlisted, { entries: ENTRIES, agency: AGENCY, nowMs: NOW }))

  it("carries the board's eyebrow, aside, sub and foot", () => {
    expect(out).toContain("Being shortlisted · 4 so far")
    expect(out).toContain("Updated as Halcyon Search adds people")
    expect(out).toContain(
      "Halcyon Search is still building this shortlist. Each name appears the moment they add someone and goes if they take them off. Their CV, the evidence and the scores arrive with the submission."
    )
    expect(out).toContain(
      "Nothing to decide yet. When the submission arrives you will read each person here in full and choose who to interview."
    )
  })

  it("names every named person, with initials in a round avatar", () => {
    for (const name of ["Amara Okonkwo", "Tomasz Wierzbicki", "Nadia Hussain"]) expect(out).toContain(name)
    expect(out).toMatch(/<span class="hm-sling-avatar" aria-hidden="true">AO<\/span>/)
    expect(out).toMatch(/<span class="hm-sling-avatar" aria-hidden="true">NH<\/span>/)
  })

  it("draws the withheld row as the ref, a dashed ?, and the reason — never a name", () => {
    const row = out.slice(out.indexOf("CAN-07") - 200, out.indexOf("CAN-07") + 200)
    expect(row).toMatch(/data-unknown="true" aria-hidden="true">\?<\/span>/)
    expect(row).toContain("Asked to be withheld")
    // The named rows show the name, not the ref.
    expect(out).not.toContain("CAN-01")
    expect(out).not.toContain("CAN-20")
  })

  it("says when each was added, by calendar day", () => {
    expect(out).toContain("Added today")
    expect(out).toContain("Added yesterday")
    expect(out).toContain("Added 24 Sep")
  })

  it("never shows anything but names: no scores, no CV, no evidence", () => {
    expect(out).not.toMatch(/FIT|must-have|See the evidence/i)
  })
})

describe("the rows", () => {
  it("keep the awaiting-permission branch for when the switch is turned back off", () => {
    const out = html(
      createElement(ShortlistingRows, {
        entries: [{ ref: "CAN-30", name: null, withheld: "awaiting_permission", addedAt: today }],
        nowMs: NOW,
      })
    )
    expect(out).toContain("CAN-30")
    expect(out).toContain("Name shown once they agree to be put forward")
    expect(COMPONENT).toContain('awaiting_permission: "Name shown once they agree to be put forward"')
  })

  it("show the ref when a shortlisted person has no name on file", () => {
    const out = html(createElement(ShortlistingRows, { entries: [{ ref: "CAN-40", name: null, withheld: null, addedAt: "" }], nowMs: NOW }))
    expect(out).toContain("CAN-40")
    expect(out).not.toContain("Added")
  })

  it("label dates and initials sensibly", () => {
    expect(addedLabel(today, NOW)).toBe("Added today")
    expect(addedLabel(yesterday, NOW)).toBe("Added yesterday")
    expect(addedLabel(earlier, NOW)).toBe("Added 24 Sep")
    expect(addedLabel("not a date", NOW)).toBeNull()
    expect(initialsOf("Amara Okonkwo")).toBe("AO")
    expect(initialsOf("Cher")).toBe("C")
    expect(initialsOf("  ")).toBe("?")
  })

  it("fall back to 'your recruiter' when the room knows no agency", () => {
    expect(shortlisterName({ agencyName: "", agencyCount: 0, recruiterName: "" })).toEqual({ lead: "Your recruiter", mid: "your recruiter" })
    expect(shortlisterName({ agencyName: null, agencyCount: 0, recruiterName: "Owen Price" })).toEqual({ lead: "Owen Price", mid: "Owen Price" })
  })

  it("never name the first-linked agency for a hiring manager linked to two", () => {
    // Linked to Halcyon (first) and Northgate; this role is Northgate's.
    const links = [{ agencyName: "Halcyon Search" }, { agencyName: "Northgate" }]
    expect(distinctAgencyCount(links)).toBe(2)
    expect(shortlisterName({ agencyName: "Halcyon Search", agencyCount: 2, recruiterName: "Priya Shah" })).toEqual({
      lead: "Priya Shah",
      mid: "Priya Shah",
    })
    expect(shortlisterName({ agencyName: "Halcyon Search", agencyCount: 2, recruiterName: null })).toEqual({
      lead: "Your recruiter",
      mid: "your recruiter",
    })
    // One agency, however many links to it: its name.
    expect(distinctAgencyCount([{ agencyName: "Halcyon Search" }, { agencyName: "Halcyon Search " }, {}])).toBe(1)
    expect(distinctAgencyCount(undefined)).toBe(0)
    expect(PAGE).toMatch(/shortlisterName\(\{\s*agencyName: room\.agencyName,\s*agencyCount: room\.agencyCount,\s*recruiterName: room\.row\?\.role\.recruiterName,?\s*\}\)/)
  })
})

describe("A · before any submission, with nobody shortlisted", () => {
  it("keeps a note, reworded", () => {
    const out = html(createElement(NothingShortlistedYet, { agency: AGENCY }))
    expect(out).toContain("Nothing shortlisted yet.")
    expect(out).toContain(
      "Names appear here as Halcyon Search adds people to the shortlist. If your recruiter sends it by email instead, it will be in your inbox."
    )
  })

  it("the old note is gone from the stage", () => {
    expect(PAGE).not.toContain("No shortlist has reached this workspace")
  })
})

describe("B · after a submission", () => {
  it("adds a divider and the added-since band only when someone was added", () => {
    const out = html(createElement(AddedSince, { entries: ENTRIES.slice(2), agency: AGENCY, nowMs: NOW }))
    expect(out).toContain('<hr class="hm-sling-divider"/>')
    expect(out).toContain("Added since · not sent yet · 2")
    expect(out).toContain(
      "Halcyon Search has shortlisted these since the submission. Their CV, evidence and scores arrive with the next one."
    )
    expect(out).toContain("Nadia Hussain")
    expect(out).toContain("Asked to be withheld")
    expect(html(createElement(AddedSince, { entries: [], agency: AGENCY, nowMs: NOW }))).toBe("")
  })

  it("the page draws added-since only under a submission, and being-shortlisted only without one", () => {
    expect(PAGE).toMatch(/list\.state === "ready" && building\.status === "ready" && \(\s*<AddedSince/)
    expect(PAGE).toMatch(/list\.state === "none" &&\s*building\.status === "ready" &&\s*!building\.submitted &&\s*\(building\.entries\.length > 0 \? \(\s*<BeingShortlisted[\s\S]*?\) : \(\s*<NothingShortlistedYet/)
    // The added-since band sits after the submission's list, before the hand-off.
    const sub = PAGE.indexOf('<ul className="hm-sl-list">')
    const since = PAGE.indexOf("<AddedSince")
    const hand = PAGE.indexOf("<HandOff")
    expect(sub).toBeGreaterThan(-1)
    expect(since).toBeGreaterThan(sub)
    expect(hand).toBeGreaterThan(since)
  })

  it("a failed first load shows the page's error idiom, never an empty list", () => {
    expect(PAGE).toMatch(/list\.state === "none" && building\.status === "error" && \(\s*<p className="ag-banner" role="alert">/)
    expect(PAGE).toMatch(/list\.state === "none" &&\s*\(building\.status === "loading" \|\| \(building\.status === "ready" && building\.submitted\)\) && \(\s*<p className="ag-quiet"/)
  })

  it("a submission that lands while the stage is open reloads the submission view, never 'Nothing shortlisted yet'", () => {
    // The submission fetch is reloadable, not a one-shot mount effect.
    expect(PAGE).toMatch(/const loadList = useCallback\(async \(\) => \{[\s\S]*?fetch\(`\/api\/hiring\/roles\/\$\{roleId\}\/shortlist`/)
    // The live list's `submitted` flag, read while no submission is on screen, reloads it.
    expect(PAGE).toMatch(/if \(list\.state === "none" && building\.submitted\) \{\s*void loadList\(\)/)
    // Someone leaving the live list after a submission (a new one carried them) reloads it too.
    expect(PAGE).toMatch(/list\.state === "ready" && before && \[\.\.\.before\]\.some\(\(r\) => !refs\.has\(r\)\)\) void loadList\(\)/)
    expect(PAGE).toMatch(/\}, \[building, list\.state, loadList\]\)/)
    // A failed reload keeps the submission already on screen.
    expect(PAGE).toMatch(/next\.state === "error" && prev\.state === "ready" \? prev : next/)
  })
})

describe("C · freshness", () => {
  it("refetches on window focus and on a 60 s interval while visible, and cleans both up", () => {
    expect(SHORTLISTING_REFRESH_MS).toBe(60_000)
    expect(COMPONENT).toMatch(/fetch\(`\/api\/hiring\/roles\/\$\{roleId\}\/shortlisting`/)
    expect(COMPONENT).toMatch(/window\.addEventListener\("focus", onFocus\)/)
    expect(COMPONENT).toMatch(/window\.removeEventListener\("focus", onFocus\)/)
    expect(COMPONENT).toMatch(/setInterval\(\(\) => \{\s*if \(document\.visibilityState === "visible"\) void load\(\)\s*\}, SHORTLISTING_REFRESH_MS\)/)
    expect(COMPONENT).toMatch(/clearInterval\(timer\)/)
  })

  it("a failed refetch keeps the last list; only a first load becomes an error", () => {
    const ready: ShortlistingState = { status: "ready", entries: ENTRIES, submitted: false }
    expect(nextShortlistingState(ready, { kind: "failed" })).toBe(ready)
    expect(nextShortlistingState({ status: "loading" }, { kind: "failed" })).toEqual({ status: "error" })
    expect(nextShortlistingState({ status: "error" }, { kind: "ok", entries: [], submitted: true })).toEqual({
      status: "ready",
      entries: [],
      submitted: true,
    })
    expect(COMPONENT).toMatch(/setState\(\(prev\) => nextShortlistingState\(prev, outcome\)\)/)
    // A stale response never overwrites a newer one.
    expect(COMPONENT).toMatch(/if \(!live \|\| mine !== seq\) return/)
  })

  it("a 404, 401 or 403 is an answer: the list is dropped, never kept, and no banner", () => {
    for (const code of [401, 403, 404]) expect(outcomeOfStatus(code)).toBe("gone")
    for (const code of [500, 502, 429]) expect(outcomeOfStatus(code)).toBe("failed")
    expect(outcomeOfStatus(200)).toBe("ok")
    const ready: ShortlistingState = { status: "ready", entries: ENTRIES, submitted: false }
    // The tie is removed while the tab is open: the names go.
    expect(nextShortlistingState(ready, { kind: "gone" })).toEqual({ status: "gone" })
    // Not theirs on first load: gone, not an error.
    expect(nextShortlistingState({ status: "loading" }, { kind: "gone" })).toEqual({ status: "gone" })
    // A later network blip does not turn "gone" into the error banner.
    expect(nextShortlistingState({ status: "gone" }, { kind: "failed" })).toEqual({ status: "gone" })
    // The page draws nothing for "gone": every band and banner is gated on another status.
    expect(PAGE).not.toMatch(/"gone"/)
  })

  it("the stage uses the hook", () => {
    expect(PAGE).toMatch(/const building = useShortlisting\(roleId\)/)
  })
})

describe("D · the recruiter's rail", () => {
  const rail = (clientName?: string) =>
    html(
      createElement(ShortlistRail, {
        company: "Meridian Health",
        clientName,
        entries: [],
        holdCount: 1,
        passedCount: 2,
        onRemove: () => {},
        onConfirm: () => {},
      })
    ).replace(/\s+/g, " ")

  it("tells the recruiter the client sees each name, and the new caption", () => {
    const out = rail("Meridian Health")
    expect(out).toContain("Meridian Health sees each name as you add it. The CV, evidence and scores wait for the submission.")
    expect(out).toMatch(/<p class="ag-sl-visible">Names visible to the client<\/p>/)
    expect(out).toContain("Opens the submission step, where you choose what else the client reads.")
    // Board 26's other lines are unchanged.
    for (const line of ["Your shortlist · Meridian Health", "Nobody yet", "Your next add lands here", "Kept for later. Never sent.", "Internal record only.", "Confirm shortlist →"]) {
      expect(out).toContain(line)
    }
  })

  it("says 'The client' when the company is unknown", () => {
    expect(rail()).toContain("The client sees each name as you add it.")
  })

  it("the step names the client company, not one person — every tied contact sees the names", () => {
    expect(AGENCY_PAGE).toMatch(/clientName: role\.company\?\.trim\(\) \|\| "The client"/)
    expect(AGENCY_PAGE).not.toMatch(/clientFirstName/)
  })

  it("the old caption appears nowhere in components/ or app/", () => {
    const OLD = "Nothing reaches the client until you build it there."
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx?|css)$/.test(name) && readFileSync(p, "utf8").includes(OLD)) hits.push(p)
      }
    }
    walk(join(process.cwd(), "components"))
    walk(join(process.cwd(), "app"))
    expect(hits).toEqual([])
  })
})
