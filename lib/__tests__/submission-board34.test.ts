/**
 * Step 07 — the shortlist goes to their workspace; files are extras
 * (Figma board 34, approved 29 Sep 2026). Pinned so the three-way format
 * switch, the fake portal mock and the "portal only" recipient card cannot
 * quietly come back.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { shortlistEmailHtml, shortlistEmailSubject } from "@/lib/agency/shortlist-email"

const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const read = (p: string) => tsCode(raw(p))
const PAGE = "app/agencies/roles/[roleId]/page.tsx"
const ROUTE = "app/api/agency/roles/[roleId]/submission/route.ts"
const PARTS = "components/agency/submission-parts.tsx"

describe("the screen: one send, to named people", () => {
  const page = read(PAGE)
  const pane = page.slice(page.indexOf('step === "submission" && (() => {'))

  it("has no format switch deciding the delivery", () => {
    expect(pane).not.toMatch(/\["document", "email", "portal"\] as const/)
    expect(page).not.toMatch(/previewFormat/)
  })

  it("always sends the chosen people, and refuses with nobody chosen", () => {
    const gen = page.slice(page.indexOf("async function generateSubmission"), page.indexOf("function copyEmailText"))
    expect(gen).toMatch(/recipients: chosenContacts\.map/)
    expect(gen).not.toMatch(/format === "portal" \?/)
    expect(gen).toMatch(/if \(chosenContacts\.length === 0\)/)
  })

  it("who gets it comes before the preview, and the preview is the hiring manager's view", () => {
    expect(pane.indexOf("Who gets it")).toBeGreaterThan(-1)
    expect(pane.indexOf("Who gets it")).toBeLessThan(pane.indexOf("<SubmissionPreview"))
    expect(pane).not.toMatch(/Accept for interview/)
    expect(pane).not.toMatch(/portal only/)
  })

  it("the role's own contact is ticked on arrival", () => {
    expect(page).toMatch(/setChosenContacts\(\(prev\) => \(prev\.length > 0 \? prev : \[role\.contact_id as string\]\)\)/)
  })

  it("closing the role left step 07 for the header menu, and it still asks first", () => {
    expect(pane).not.toMatch(/Close role and start retention/)
    expect(page).not.toMatch(/function setRoleStatus/)
    const header = read("components/agency/role-header.tsx")
    expect(header).toMatch(/Close role…/)
    const ask = header.slice(header.indexOf("{closeAsk && ("))
    expect(ask).toMatch(/role="alertdialog"/)
    expect(ask).toMatch(/retention clock/)
    expect(ask).toMatch(/Keep it open/)
    // Viewers cannot close.
    expect(header).toMatch(/data\.callerRole !== "viewer"/)
  })
})

describe("the preview draws the disclosure line the workspace draws", () => {
  const parts = read(PARTS)
  const hm = read("app/hiring/roles/[roleId]/shortlist/page.tsx")

  it("says the same words as the hiring manager's shortlist", () => {
    for (const phrase of [
      "Not decided yet",
      "The recruiter&apos;s screening notes are not part of this submission.",
      "See the evidence and CV",
      "Choose and offer times",
    ]) {
      expect(parts, phrase).toContain(phrase)
      expect(hm, phrase).toContain(phrase)
    }
  })

  it("a withheld name shows as the ref", () => {
    expect(parts).toMatch(/r\.redacted \|\| !r\.name \? r\.ref : r\.name/)
  })

  it("the document keeps its footer and its known gaps", () => {
    expect(parts).toMatch(/Known gaps, stated plainly/)
    expect(parts).toMatch(/This document is confidential/)
  })
})

describe("the route: workspace first, mail as a pointer", () => {
  const route = read(ROUTE)

  it("invites a contact with no workspace, always, and emails the rest only when asked", () => {
    expect(route).toMatch(/if \(!workspace\) \{\s*const invite = await createClientInvite\(auth\.ctx, contactId\)/)
    expect(route).toMatch(/if \(\(emailSummary \|\| !workspace\) && contact\.email\)/)
    expect(route).toMatch(/const emailSummary = body\?\.extras\?\.email === true/)
  })

  it("a withheld name travels as the ref in the email too", () => {
    expect(route).toMatch(/name: e\.redacted \|\| !e\.full_name \? e\.ref : e\.full_name/)
  })
})

describe("the email is a pointer, not the shortlist", () => {
  const html = shortlistEmailHtml({
    agencyName: "Halcyon <Search>",
    company: "Meridian Health",
    roleTitle: "Product Owner",
    intro: "Five strong people.",
    people: [{ name: "CAN-03", title: "Lead PO" }, { name: "A Person", title: "PO" }],
    url: "https://example.test/hiring/roles/r/shortlist",
    invite: false,
  })

  it("names and one line each, plus the way in", () => {
    expect(html).toContain("CAN-03")
    expect(html).toContain("Open the shortlist")
    expect(html).toContain("https://example.test/hiring/roles/r/shortlist")
  })

  it("escapes recruiter-typed text", () => {
    expect(html).toContain("Halcyon &lt;Search&gt;")
    expect(html).not.toContain("<Search>")
  })

  it("an invite says so and asks for the right address", () => {
    const inv = shortlistEmailHtml({
      agencyName: "Halcyon",
      company: "",
      roleTitle: "PO",
      intro: "",
      people: [{ name: "X", title: "" }],
      url: "https://example.test/hiring/invite/t",
      invite: true,
      inviteExpiresAt: "2026-10-29T00:00:00Z",
    })
    expect(inv).toContain("Accept and open the shortlist")
    expect(inv).toMatch(/sign in with this email address/)
  })

  it("the template has no field for evidence, scores or CV text", () => {
    const src = read("lib/agency/shortlist-email.ts")
    expect(src).not.toMatch(/\bquote\b|overall|strengths|cv_text/)
    expect(shortlistEmailSubject({ roleTitle: "PO", count: 1 })).toBe("Shortlist: PO (1 candidate)")
  })
})

describe("the receipt reads real rows and carries nothing personal", () => {
  it("opening it in the workspace counts as opening it", () => {
    const hm = read("app/api/hiring/roles/[roleId]/shortlist/route.ts")
    expect(hm).toMatch(/update\(\{ first_opened_at: now \}\)\.eq\("id", recipientId\)\.is\("first_opened_at", null\)/)
  })

  it("the progress route selects no names or addresses", () => {
    const p = read("app/api/agency/roles/[roleId]/submission/progress/route.ts")
    expect(p).not.toMatch(/full_name|email|cv_text/)
  })

  it("the contacts list says whether there is a workspace, never whose", () => {
    const c = read("app/api/agency/contacts/route.ts")
    expect(c).toMatch(/has_workspace: Boolean\(user_id\)/)
    expect(c).toMatch(/\(\{ user_id, \.\.\.c \}\)/)
  })
})
