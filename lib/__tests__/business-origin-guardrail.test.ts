/**
 * B2B links must never hardcode a host.
 *
 * Tailr for Agencies is getting its own domain, but not yet (22 Aug 2026):
 * the build continues on staging and the domain is bought when production is
 * wanted. That deferral is only safe while every B2B link is built from
 * getBusinessOrigin(), which reads NEXT_PUBLIC_BUSINESS_URL — so moving is a
 * config change, not a hunt through the codebase.
 *
 * This is the test that keeps it a config change. One hardcoded
 * `https://agencies.gettailr.com/...` in a link, invite or email written
 * between now and then, and the move quietly stops being cheap — the link
 * still works in staging, still passes review, and points at the wrong domain
 * the day the real one goes live.
 *
 * Sender addresses are exempt and listed below: `notices@gettailr.com` is a
 * Resend verified-sender constraint, not a link. They are their own to-do at
 * domain time (see docs/DOMAINS.md) rather than a bug now.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const ROOTS = [
  "lib/agency",
  "app/agencies",
  "app/hiring",
  "app/api/agency",
  "app/api/hiring",
]

function sourceFiles(dir: string): string[] {
  const abs = join(process.cwd(), dir)
  let entries: string[]
  try {
    entries = readdirSync(abs)
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const full = join(abs, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(join(dir, entry)))
    } else if (/\.tsx?$/.test(entry) && !full.includes("__tests__")) {
      out.push(join(dir, entry))
    }
  }
  return out
}

/** An address, not a link: Resend only has gettailr.com verified. */
const isSenderOrAgent = (line: string) =>
  /@gettailr\.com/.test(line) || /user-agent/i.test(line)

describe("B2B links are built from configuration, not a hardcoded host", () => {
  const files = ROOTS.flatMap(sourceFiles)

  it("finds the B2B source tree at all", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("no agency or hiring source hardcodes a URL origin", () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(join(process.cwd(), file), "utf8").split("\n")
      lines.forEach((line, i) => {
        // A scheme followed by a host — the shape of a baked-in origin.
        if (!/https?:\/\/[a-z0-9.-]+/i.test(line)) return
        if (isSenderOrAgent(line)) return
        // localhost is dev-only and never shipped as a B2B link.
        if (/localhost|127\.0\.0\.1/.test(line)) return
        // Doc comments and links to external references are prose, not links
        // the product builds.
        if (/^\s*(\*|\/\/)/.test(line)) return
        offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
    }

    expect(
      offenders,
      "build B2B links with getBusinessOrigin() / businessPath() — a hardcoded origin still works on staging, passes review, and points at the wrong domain the day the real one goes live"
    ).toEqual([])
  })
})
