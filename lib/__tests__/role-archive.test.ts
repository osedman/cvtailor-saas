/**
 * A finished role leaves the live table — and "finished" has two shapes.
 *
 * Ose, 16 September 2026: "on the live roles, it shouldn't be there once the
 * handover is there; it should be removed."
 *
 * The queue was already dropping `closed` roles. What it was not dropping was
 * a role whose handover pack had actually been DELIVERED but which nobody had
 * got round to closing — and closing is a separate, deliberate act because it
 * starts the retention clock on every candidate attached to the role. So a
 * role could be finished in practice and open in the data: ROL-2408 and
 * ROL-2410 were delivered on 24 August and were still in the live queue three
 * weeks later.
 *
 * THE DISTINCTION IS THE POINT. Delivered is not closed. The archive holds
 * both and says which is which, because the difference is a job somebody
 * still owes — and quietly auto-closing on delivery would start a retention
 * clock that nobody chose to start.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const TODAY = "app/api/agency/today/route.ts"
const DASH = "app/api/agency/dashboard/route.ts"
const PAGE = "app/agencies/page.tsx"
const CSS = () => readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")

describe("the live queue drops what is finished", () => {
  const today = read(TODAY)

  it("still drops closed roles", () => {
    expect(today).toMatch(/\.neq\("status", "closed"\)/)
  })

  it("and now drops a role whose pack actually reached the employer", () => {
    expect(today).toMatch(/\.filter\(\(f\) => !f\.pack\?\.deliveredAt\)/)
  })

  it("keys on DELIVERED, not on a pack merely existing", () => {
    // A generated pack is a draft. ROL-2409 and ROL-2413 have packs that were
    // never delivered and must stay in the queue — they are unfinished work.
    expect(today).not.toMatch(/f\.pack\s*\)/)
    expect(today).toMatch(/deliveredAt/)
  })
})

describe("the archive holds both endings, and distinguishes them", () => {
  const page = read(PAGE)

  it("collects closed roles AND delivered ones", () => {
    expect(page).toMatch(/r\.status === "closed" \|\| r\.handed_over_at/)
  })

  it("counts the ones still owed a close", () => {
    expect(page).toMatch(/needsClosing/)
    expect(page).toMatch(/handed over, not yet closed/i)
  })

  it("tells the reader closing is what starts retention", () => {
    // Without this the row is a nag with no reason attached.
    expect(page).toMatch(/close it to start retention/i)
    expect(page).toMatch(/starts the retention clock/i)
  })

  it("says plainly that nothing is deleted", () => {
    // An archive that read as a bin would break the one promise this product
    // makes about its own working.
    expect(page).toMatch(/Nothing here is deleted/i)
  })

  it("never closes a role by itself", () => {
    // Auto-closing on delivery would start a retention clock nobody chose to
    // start. The archive may OFFER closing; it must not perform it.
    const archive = page.slice(page.indexOf("const archived"))
    expect(archive).not.toMatch(/status:\s*"closed"/)
    expect(archive).not.toMatch(/PATCH|method:\s*"PATCH"/)
  })
})

describe("the dashboard supplies the fact the archive needs", () => {
  const dash = read(DASH)

  it("reads delivered_at, not just the pack's existence", () => {
    expect(dash).toMatch(/from\("handover_packs"\)\.select\("role_id, delivered_at"\)/)
    expect(dash).toMatch(/deliveredByRole/)
  })

  it("puts it on the card", () => {
    expect(dash).toMatch(/handed_over_at: deliveredByRole\.get\(role\.id\) \?\? null/)
  })

  it("leaves `phase` keyed on the pack existing", () => {
    // Phase means "where this role is", and generating a pack IS the handover
    // phase. Only the archive needs delivery. Conflating them would move a
    // role out of the live table the moment a draft pack was made.
    expect(dash).toMatch(/const phase = handoverRoleIds\.has\(role\.id\)/)
  })
})

describe("the band behaves like a readout", () => {
  it("is collapsed until asked, because it only grows", () => {
    expect(read(PAGE)).toMatch(/useState\(false\)/)
    expect(read(PAGE)).toMatch(/aria-expanded=\{showArchive\}/)
  })

  it("marks an unclosed role without relying on colour alone", () => {
    // data-owed drives the colour; the words "close it to start retention"
    // carry the meaning for anyone who cannot separate two browns.
    expect(CSS()).toMatch(/\.ag-archive-state\[data-owed="true"\]/)
    expect(read(PAGE)).toMatch(/close it to start retention/i)
  })
})
