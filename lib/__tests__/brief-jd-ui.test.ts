/**
 * The job description on the brief — the three surfaces of board 28
 * (node 551:2, signed off 28 Sep 2026). Source scans for structure, in the
 * repo's style, and a static render for the states a scan could only
 * pretend to check (which line is first, what the pill says, which hint).
 *
 *   A · the form: the JD is the FIRST section, un-numbered, on both sides
 *   B · the review: the Job description line is the first line, CHANGED ·
 *       WAS {old name} only when jdFileId changed
 *   C · the role intake: FROM THE BRIEF · {name} only when status.jd exists
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BriefForm, type BriefJdView } from "../../components/agency/brief-form"
import { BriefReview } from "../../components/agency/brief-review"
import { DEFAULT_BRIEF, type BriefConfig } from "../agency/brief-options"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const fnBody = (src: string, marker: string): string => {
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`not found: ${marker}`)
  const rest = src.slice(start + marker.length)
  const end = rest.search(/\n(export )?(function|const|interface|type) /)
  return src.slice(start, end === -1 ? src.length : start + marker.length + end)
}
/** One JSX element's opening tag, from `<Name` to its closing `/>` or `>`. */
const jsxOpen = (src: string, name: string, from = 0): string => {
  const start = src.indexOf(`<${name}`, from)
  if (start === -1) throw new Error(`no <${name}`)
  return src.slice(start, src.indexOf("/>", start) + 2)
}

const form = code(read("components/agency/brief-form.tsx"))
const review = code(read("components/agency/brief-review.tsx"))
// The recruiter's brief body lives in BriefEditor since 2 Oct 2026 (frame 36):
// the Briefs page and step 01 "Role & brief" both render it.
const recruiterPage = code(read("components/agency/brief-editor.tsx"))
const clientPage = code(read("app/hiring/briefs/[briefId]/page.tsx"))
const rolePage = read("app/agencies/roles/[roleId]/page.tsx")
const briefs = code(read("lib/agency/search-briefs.ts"))

const OLD: BriefJdView = { fileId: "11111111-1111-4111-8111-111111111111", name: "Business-Analyst-JD-Meridian.pdf", sizeBytes: 188_416, contentType: "application/pdf", uploadedBySide: "recruiter", createdAt: "2026-09-26T10:00:00Z", textChars: 7400 }
const NEW: BriefJdView = { ...OLD, fileId: "22222222-2222-4222-8222-222222222222", name: "Business-Analyst-JD-Meridian-v2.pdf", sizeBytes: 195_584, uploadedBySide: "client" }
const SCAN: BriefJdView = { ...OLD, fileId: "33333333-3333-4333-8333-333333333333", name: "scan.pdf", textChars: 0 }
const cfg = (jdFileId: string | null): BriefConfig => ({ ...DEFAULT_BRIEF, jdFileId })

const renderForm = (props: Partial<Parameters<typeof BriefForm>[0]> & { config: BriefConfig }) =>
  renderToStaticMarkup(
    createElement(BriefForm, {
      onChange: () => {},
      contacts: [],
      side: "recruiter",
      briefId: "brief-1",
      jd: null,
      previousJd: null,
      amending: false,
      agencyName: "Halcyon Search",
      contactName: "Ose Oifoh",
      onError: () => {},
      ...props,
    })
  )
const renderReview = (props: Partial<Parameters<typeof BriefReview>[0]> & { config: BriefConfig }) =>
  renderToStaticMarkup(
    createElement(BriefReview, { previous: null, changedKeys: [], names: {}, agencyName: "Halcyon Search", side: "recruiter", briefId: "brief-1", jd: null, previousJd: null, ...props })
  )
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ")

describe("A · the form: the job description is the first section, un-numbered", () => {
  it("is the first thing inside the fieldset, above 1 · The rounds", () => {
    const body = fnBody(form, "export function BriefForm(")
    const inside = body.slice(body.indexOf('<fieldset className="ag-brief-form"'))
    const jd = inside.indexOf("<JdSection")
    const rounds = inside.indexOf('<Section n={1} title="The rounds"')
    expect(jd).toBeGreaterThan(-1)
    expect(rounds).toBeGreaterThan(jd)
    // Nothing else is rendered between the fieldset and the JD section —
    // only the step-01 switch that leaves it out (the role's own JD box is
    // beside the terms there, frame 36).
    expect(inside.slice(inside.indexOf(">") + 1, jd).trim()).toBe("{!hideJd && (")
  })

  it("renders as the first section, with no number, the CLIENT AGREES pill and the board's sub", () => {
    const html = renderForm({ config: cfg(null) })
    const first = html.indexOf('<section class="ag-brief-section"')
    const firstSection = html.slice(first, html.indexOf("</section>", first))
    expect(firstSection).toContain(">The job description</h3>")
    expect(firstSection).not.toMatch(/\d · The job description/)
    expect(firstSection).toContain("ag-brief-tier-1")
    expect(text(firstSection)).toContain("The document the terms are about. The client sees it and can replace it; a new file is an amendment both sides sign again. When a role runs on this brief, the description lands in its intake.")
    expect(html.indexOf("1 · The rounds")).toBeGreaterThan(html.indexOf("The job description"))
  })

  it("empty: a dashed zone that is a button, over a hidden PDF/DOCX/TXT picker", () => {
    const html = renderForm({ config: cfg(null) })
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="\.pdf,\.docx,\.txt"/)
    expect(html).toMatch(/<button type="button" class="ag-brief-jd-drop"/)
    const t = text(html)
    for (const s of ["Attach the job description", "PDF, DOCX or TXT, up to 10 MB. Drop it here or choose a file.", "Choose a file"]) expect(t).toContain(s)
    // It takes a drop, and reads "Reading the file…" busy while uploading.
    const jd = fnBody(form, "function JdSection(")
    expect(jd).toMatch(/onDrop=/)
    expect(jd).toMatch(/aria-busy=\{reading \|\| undefined\}/)
    expect(jd).toContain("Reading the file…")
  })

  it("attached: the ext square, name, meta with who and TEXT READ, Download to the side's route, Replace, Remove", () => {
    const html = renderForm({ config: cfg(OLD.fileId), jd: OLD })
    const t = text(html)
    expect(t).toContain("PDF")
    expect(t).toContain(OLD.name)
    expect(t).toMatch(/184 KB · Added by you · 26 Sep · Text read/)
    expect(html).toContain(`href="/api/agency/briefs/brief-1/jd/${OLD.fileId}"`)
    for (const s of ["Download", "Replace", "Remove"]) expect(t).toContain(s)
    expect(t).toContain("Read once for the role's intake. Nothing is parsed until you press Extract requirements there.")
    expect(t).not.toContain("Changed · was")
  })

  it("names the other side when they attached it, and the client downloads from the client's route", () => {
    expect(text(renderForm({ config: cfg(NEW.fileId), jd: NEW }))).toContain("Added by Ose Oifoh")
    const client = renderForm({ config: cfg(OLD.fileId), jd: OLD, side: "client", amending: true })
    expect(text(client)).toContain("Added by Halcyon Search")
    expect(client).toContain(`href="/api/hiring/briefs/brief-1/jd/${OLD.fileId}"`)
  })

  it("NO TEXT FOUND: the meta says so and the hint tells them to paste instead", () => {
    const t = text(renderForm({ config: cfg(SCAN.fileId), jd: SCAN }))
    expect(t).toMatch(/· No text found/)
    expect(t).toContain("Nothing could be read from this file — a scan, perhaps. The role's intake will stay empty; paste the description there instead.")
    expect(t).not.toContain("Read once for the role's intake")
    expect(form).toContain("data-jd-no-text")
  })

  it("replaced on an amendment: CHANGED · WAS {old name} and the signature sentence; never on a first draft", () => {
    const amended = text(renderForm({ config: cfg(NEW.fileId), jd: OLD, uploads: [NEW], amending: true }))
    expect(amended).toContain(`Changed · was ${OLD.name}`)
    expect(amended).toContain("A new file is a new version: the client's signature is cleared until they approve it.")
    // The same file as the latest version, nothing before it: nothing changed.
    expect(text(renderForm({ config: cfg(OLD.fileId), jd: OLD, amending: true }))).not.toContain("Changed · was")
    // A draft that has never been sent is measured against nothing.
    expect(text(renderForm({ config: cfg(NEW.fileId), jd: OLD, uploads: [NEW], amending: false }))).not.toContain("Changed · was")
  })

  it("uploads multipart to the side's route, puts the id on the config, and sends refusals to the page's banner", () => {
    const jd = fnBody(form, "function JdSection(")
    expect(jd).toMatch(/form\.append\("file", file\)/)
    expect(jd).toMatch(/`\$\{side === "recruiter" \? "\/api\/agency" : "\/api\/hiring"\}\/briefs\/\$\{briefId\}\/jd`, \{ method: "POST", body: form, signal: c\.signal \}/)
    expect(jd).toMatch(/onPick\(body\.file\.fileId\)/)
    expect(jd).toMatch(/onError\(typeof body\.error === "string" \? body\.error/)
    // Remove sets the id to null; the id lands on the config as it is when the upload returns.
    expect(jd).toMatch(/const remove = \(\) => \{[\s\S]*?onPick\(null\)[\s\S]*?\n  \}/)
    expect(jd).toMatch(/onClick=\{remove\}/)
    expect(fnBody(form, "export function BriefForm(")).toMatch(/onPick=\{\(id\) => onChange\(\{ \.\.\.latest\.current, jdFileId: id \}\)\}/)
  })
})

describe("both brief pages pass their side", () => {
  it("the recruiter's page passes side=\"recruiter\" to the form and the review, with the brief's JD pieces", () => {
    const f = jsxOpen(recruiterPage, "BriefForm")
    for (const p of ['side="recruiter"', "briefId={briefId}", "jd={brief.latest.jd}", "previousJd={brief.previous?.jd ?? null}", "amending={!isDraft}", "agencyName={brief.agencyName}", "contactName={brief.contactName}", "onError={setError}"]) expect(f).toContain(p)
    expect(jsxOpen(recruiterPage, "BriefReview")).toContain('side="recruiter"')
  })
  it("the client's page passes side=\"client\" to both, keeps its uploads across the summary, and never offers a file as a contact", () => {
    const f = jsxOpen(clientPage, "BriefForm")
    for (const p of ['side="client"', "briefId={briefId}", "jd={brief.latest.jd}", "amending", "onError={setError}", "uploads={uploads}", "onUploaded="]) expect(f).toContain(p)
    const r = jsxOpen(clientPage, "BriefReview")
    expect(r).toContain('side="client"')
    expect(r).toContain("jd={draftJd}")
    expect(clientPage).toMatch(/Object\.entries\(brief\.names\)\.filter\(\(\[id\]\) => !fileIds\.has\(id\)\)/)
  })
})

describe("B · the review: the Job description line is first", () => {
  it("renders before the rounds, with name, size and Download; None attached when there is none", () => {
    const html = renderReview({ config: cfg(OLD.fileId), jd: OLD })
    const lines = html.split('<div class="ag-brief-line').slice(1)
    expect(text(lines[0])).toContain("Job description")
    expect(text(lines[1])).toContain("Rounds")
    expect(text(lines[0])).toMatch(/Business-Analyst-JD-Meridian\.pdf · 184 KB · Download/)
    expect(html).toContain(`href="/api/agency/briefs/brief-1/jd/${OLD.fileId}"`)
    expect(text(renderReview({ config: cfg(null) }))).toContain("Job description None attached")
    expect(review.indexOf("{jdLine}")).toBeLessThan(review.indexOf("{TIER1_LINES.map"))
  })
  it("CHANGED · WAS {previous name} only when jdFileId is in changedKeys", () => {
    const changed = renderReview({ config: cfg(NEW.fileId), jd: NEW, previousJd: OLD, changedKeys: ["jdFileId"] })
    const first = changed.split('<div class="ag-brief-line').slice(1)[0]
    expect(first).toContain("data-changed")
    expect(text(first)).toContain(`Changed · was ${OLD.name}`)
    const same = renderReview({ config: cfg(NEW.fileId), jd: NEW, previousJd: OLD, changedKeys: ["rounds"] })
    expect(text(same.split('<div class="ag-brief-line').slice(1)[0])).not.toContain("Changed")
  })
  it("the client's copy carries Change on the line; the recruiter's does not", () => {
    const client = renderReview({ config: cfg(OLD.fileId), jd: OLD, side: "client", onChange: () => {} })
    expect(text(client.split('<div class="ag-brief-line').slice(1)[0])).toContain("Change")
    expect(client).toContain(`href="/api/hiring/briefs/brief-1/jd/${OLD.fileId}"`)
    const recruiter = renderReview({ config: cfg(OLD.fileId), jd: OLD })
    expect(recruiter.split('<div class="ag-brief-line').slice(1)[0]).not.toContain("ag-brief-change")
  })
})

describe("C · the role intake names the brief's file", () => {
  it("roleBriefStatus returns jd from the COPIED config, through the pointer read", () => {
    const fn = fnBody(briefs, "export async function roleBriefStatus")
    expect(fn).toMatch(/listBriefJdFiles\(role\.brief_id as string, copy\.jdFileId \? \[copy\.jdFileId\] : \[\]\)/)
    expect(fn).toMatch(/jd: jdFile \? \{ fileId: jdFile\.fileId, name: jdFile\.name \} : null/)
    expect(fn).not.toMatch(/getBriefJdText/)
  })
  it("the chip and Download render only when status.jd exists, above the JD textarea", () => {
    const chip = rolePage.indexOf('className="ag-field-label ag-brief-jd-from"')
    const box = rolePage.indexOf('<textarea className="ag-textarea jd"')
    expect(chip).toBeGreaterThan(-1)
    expect(box).toBeGreaterThan(chip)
    const guard = rolePage.lastIndexOf("{briefStatus && briefStatus !== \"error\" && briefStatus.status?.jd && (", chip)
    expect(guard).toBeGreaterThan(-1)
    expect(chip - guard).toBeLessThan(200)
    expect(rolePage.slice(chip, box)).toContain("From the brief · {briefStatus.status.jd.name}")
    expect(rolePage.slice(chip, box)).toMatch(/href=\{`\/api\/agency\/briefs\/\$\{briefStatus\.status\.briefId\}\/jd\/\$\{briefStatus\.status\.jd\.fileId\}`\} download/)
  })
  it("step 01 carries the role's own brief, not a card to connect someone else's (frame 36)", () => {
    expect(rolePage).toContain("<BriefEditor briefId={roleBriefId} embedded")
    expect(rolePage).toContain("Start the terms")
    expect(rolePage).not.toContain("Run this role on a brief?")
    // One job description: the form inside the terms does not offer a second.
    expect(recruiterPage).toContain("hideJd={embedded}")
  })
})

describe("the review's fixes: signatures, copy, focus, names, locking", () => {
  it("the signature sentence shows only when THIS edit changes the file, and says so for a removal", () => {
    // The recruiter sent v2 with a new file; the client opens Change and
    // leaves the file alone: the pill is inherited, the sentence is not.
    const inherited = text(renderForm({ config: cfg(NEW.fileId), jd: NEW, previousJd: OLD, amending: true, side: "client" }))
    expect(inherited).toContain(`Changed · was ${OLD.name}`)
    expect(inherited).not.toContain("signature is cleared")
    // This edit removes the file: no "new file" sentence under an empty zone.
    const removed = text(renderForm({ config: cfg(null), jd: OLD, amending: true }))
    expect(removed).toContain(`Changed · was ${OLD.name}`)
    expect(removed).toContain("Removing the file is a new version: the client's signature is cleared until they approve it.")
    expect(removed).not.toContain("A new file is a new version")
    // The client replacing it clears the agency's signature.
    const clientNew = text(renderForm({ config: cfg(NEW.fileId), jd: OLD, uploads: [NEW], amending: true, side: "client" }))
    expect(clientNew).toContain("A new file is a new version: Halcyon Search's signature is cleared until they approve it.")
  })

  it("copy counts the job description: the client's form aside and the recruiter's review note", () => {
    expect(clientPage).toContain("Only the job description and the four numbered sections after it are yours to change")
    expect(clientPage).not.toContain("Only the first four sections")
    expect(text(renderReview({ config: cfg(null) }))).toContain("The job description and the four terms the client signs for.")
  })

  it("one always-mounted status line announces the upload; no control is disabled out from under focus", () => {
    const jd = fnBody(form, "function JdSection(")
    expect(renderForm({ config: cfg(null) })).toMatch(/<p class="ag-sr-only" role="status" aria-live="polite">/)
    expect(renderForm({ config: cfg(OLD.fileId), jd: OLD })).toMatch(/<p class="ag-sr-only" role="status" aria-live="polite">/)
    expect(jd).not.toMatch(/disabled=\{reading\}/)
    expect(jd).toMatch(/aria-disabled=\{reading \|\| undefined\}/)
    // Only the persistent line carries role="status" inside the section.
    expect(jd.match(/role="status"/g)?.length).toBe(1)
    expect(jd).toMatch(/setLive\(`Attached \$\{body\.file\.name\}`\)/)
    // Focus lands on the file name after an upload and on the zone after Remove.
    expect(jd).toMatch(/focusNext\.current = "name"/)
    expect(jd).toMatch(/focusNext\.current = "zone"/)
    expect(jd).toMatch(/nameRef\.current\?\.focus\(\)/)
    expect(jd).toMatch(/zoneRef\.current\?\.focus\(\)/)
  })

  it("every Download names its file; Replace, Remove and Change name the job description", () => {
    const f = renderForm({ config: cfg(OLD.fileId), jd: OLD })
    expect(f).toContain(`aria-label="Download ${OLD.name}"`)
    expect(f).toContain('aria-label="Replace the job description"')
    expect(f).toContain('aria-label="Remove the job description"')
    const r = renderReview({ config: cfg(OLD.fileId), jd: OLD, side: "client", onChange: () => {} })
    expect(r).toContain(`aria-label="Download ${OLD.name}"`)
    expect(r).toContain('aria-label="Change the job description"')
    expect(rolePage).toContain("aria-label={`Download ${briefStatus.status.jd.name}`}")
  })

  it("44px targets reach the links (inline-flex) on touch and at phone width", () => {
    const css = read("app/agencies/agencies.css")
    expect(css).toMatch(/\.ag-brief-jd-link, \.ag-brief-jd-quiet \{ display: inline-flex; align-items: center;/)
    expect(css).toMatch(/@media \(pointer: coarse\), \(max-width: 640px\) \{ \.ag-brief-jd-link, \.ag-brief-jd-quiet \{ min-height: 44px; \} \}/)
  })

  it("an upload holds the page's buttons and never outlives the form", () => {
    const jd = fnBody(form, "function JdSection(")
    // Aborted on unmount; an aborted upload writes nothing; the page is always released.
    expect(jd).toMatch(/useEffect\(\(\) => \{\s*const c = ctrl\s*return \(\) => c\.current\?\.abort\(\)\s*\}, \[\]\)/)
    expect(jd).toMatch(/signal: c\.signal/)
    expect(jd).toMatch(/if \(c\.signal\.aborted\) return\s*if \(!res\.ok/)
    expect(jd).toMatch(/finally \{[\s\S]*?onUploadingChange\?\.\(false\)/)
    expect(fnBody(form, "export function BriefForm(")).toContain("onUploadingChange={onUploadingChange}")

    // The recruiter's page: Send, Save draft, Discard, Send vN and Approve.
    expect(jsxOpen(recruiterPage, "BriefForm")).toContain("onUploadingChange={setUploading}")
    for (const act of ["send", "save", "discard", "approve"]) {
      const buttons = recruiterPage.split(`onClick={() => void act("${act}")}`).slice(1)
      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) expect(b.slice(0, b.indexOf(">"))).toMatch(/disabled=\{!!busy \|\| uploading/)
    }
    expect(recruiterPage).toMatch(/if \(!brief \|\| !draft \|\| uploading\) return/)

    // The client's page: Send back, Approve, Undo and Back to the summary.
    expect(jsxOpen(clientPage, "BriefForm")).toContain("onUploadingChange={setUploading}")
    expect(clientPage).toMatch(/const locked = !!busy \|\| uploading/)
    expect(clientPage).toMatch(/onClick=\{\(\) => void sendBack\(\)\} disabled=\{locked\}/)
    expect(clientPage).toMatch(/onClick=\{\(\) => void approve\(\)\} disabled=\{locked\}/)
    expect(clientPage).toMatch(/setEditing\(false\)\s*\}\}\s*disabled=\{locked\}/)
    expect(clientPage).toMatch(/onClick=\{\(\) => setEditing\(false\)\} disabled=\{uploading\}/)
  })
})
