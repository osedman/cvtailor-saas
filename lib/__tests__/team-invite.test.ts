/**
 * Settings → Team (Figma frame 22, 21 Sep 2026). The invite route used to
 * answer {added:true} when staging refused to send the email, so a tester
 * could be added and never hear about it — the `200 {enabled:false}` shape
 * CLAUDE.md warns about. These pin the fix and the screen's promises.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (f: string) => tsCode(readFileSync(join(process.cwd(), f), "utf8"))
const route = read("app/api/agency/team/route.ts")
const screen = read("components/agency/team-section.tsx")
const settings = read("app/agencies/settings/page.tsx")

describe("the invite says whether the email went", () => {
  it("returns what sendEmail actually did, not a bare added:true", () => {
    expect(route).toMatch(/const mail = await sendEmail\(/)
    expect(route).toMatch(/email: \{ sent: mail\.sent, skipped:/)
    expect(route).not.toMatch(/NextResponse\.json\(\{ added: true, role \}/)
  })
  it("the screen never reads 'added' as 'told'", () => {
    expect(screen).toMatch(/body\.email\?\.sent/)
    expect(screen).toMatch(/could not email them/)
    expect(screen).toMatch(/EMAIL_ALLOWLIST/)
  })
  it("an existing member in the same role changes nothing", () => {
    expect(route).toMatch(/already: true/)
  })
})

describe("the lines the frame holds", () => {
  it("suspend, never delete — no DELETE handler, no remove button", () => {
    expect(route).not.toMatch(/export async function DELETE/)
    expect(screen).not.toMatch(/method: "DELETE"/)
    expect(screen).not.toMatch(/>\s*Remove/)
  })
  it("owner is not offered from the add form, matching the API", () => {
    const form = screen.slice(screen.indexOf('id="team-role"'), screen.indexOf("</select>", screen.indexOf('id="team-role"')))
    expect(form).not.toMatch(/value="owner"/)
  })
  it("the form renders for owners only", () => {
    expect(screen).toMatch(/\{isOwner \? \(\s*<form/)
  })
  it("lives in Settings", () => {
    expect(settings).toMatch(/<TeamSection /)
  })
})
