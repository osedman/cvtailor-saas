/**
 * A stored CV must always be reachable by the thing that deletes it.
 *
 * `purge_candidate` finds a CV through `candidates.cv_storage_path` and
 * nothing else. So a blob whose pointer was never written cannot be reached
 * by an erasure request, a retention purge, or a person asking to be
 * forgotten — it is a CV that survives its own deletion, and nothing
 * anywhere would ever say so.
 *
 * Until 19 September 2026 the upload's error was handled and the pointer
 * write's was discarded. Found while tracing 22 orphaned files in the staging
 * bucket, none of which any erasure path could have reached.
 *
 * Scanned as CODE: the module explains this rule at length now, and a raw
 * scan would match its own documentation — the trap source-scan.ts exists
 * for, hit seven times in this repo.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const ingest = tsCode(readFileSync(join(process.cwd(), "lib/agency/ingest.ts"), "utf8"))

describe("the CV pointer is never written blind", () => {
  it("checks the error on the cv_storage_path update", () => {
    // The specific defect: `await admin.from("candidates").update({...})`
    // with the result thrown away.
    expect(ingest).toMatch(/const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin[\s\S]{0,120}cv_storage_path/)
  })

  it("removes the blob when the pointer cannot be written", () => {
    // Keeping the file would mean keeping something no erasure path can
    // reach. Losing the compliance copy is recoverable; an unreachable CV
    // is not.
    const block = ingest.slice(ingest.indexOf("cv_storage_path"))
    expect(block).toMatch(/storage\s*\n?\s*\.from\("agency-cvs"\)\s*\n?\s*\.remove\(\[path\]\)/)
  })

  it("says the word ORPHANED when both the write and the cleanup fail", () => {
    // The last line of defence is a log somebody can search for. If it is
    // not named as what it is, nobody finds it — which is exactly how 22 of
    // them accumulated unnoticed.
    expect(ingest).toMatch(/ORPHANED CV/)
  })

  it("only sets the in-memory path after the write succeeded", () => {
    // Otherwise the returned candidate claims a stored CV the database does
    // not know about, and every caller downstream believes it.
    expect(ingest).toMatch(/else\s*\{\s*candidate\.cv_storage_path = path/)
  })
})
