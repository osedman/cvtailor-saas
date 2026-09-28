/**
 * The CV draft in localStorage — mechanism A of the stale-CV pair.
 *
 * Diagnosed 22 Aug 2026, fixed 14 Sep. Three faults in one effect pair:
 *
 *   1. THE FILENAME LED THE TEXT. parseFile wrote cvtailor:cv-filename the
 *      instant an upload parsed, while the text waited out an 800ms debounce.
 *      Reload inside that window and the editor came back showing the NEW
 *      file's name above the OLD file's text — a document mislabelled as the
 *      one that replaced it, which you would then tailor and send. The label
 *      led the content, so the lie was invisible.
 *   2. NOTHING FLUSHED. A reload, a back-navigation or a closed tab inside
 *      those 800ms discarded everything typed since the last write, and the
 *      restore then brought back the previous CV as though nothing happened.
 *   3. THE GUARD WAS DEAD. `if (saved && !cvText)` with empty deps can only
 *      ever see the first render's cvText, which the parent always
 *      initialises to "". It read like protection and was not.
 *
 * Verified in a real browser against the running app, not only here:
 * pagehide inside the debounce rescued the edit; pasting removed the stale
 * filename; a fast exit with an empty editor left a saved CV untouched; a
 * settled clear still cleared. This file stops the shapes coming back.
 *
 * There is no DOM test environment in this repo (vitest runs `node`), so
 * these are source scans with comments stripped.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const src = tsCode(
  readFileSync(join(process.cwd(), "components/cv-tailor/resizable-panels.tsx"), "utf8")
)

describe("the CV and its filename are one fact", () => {
  it("only the persist function writes either key", () => {
    // parseFile used to write the filename on its own. Every setItem for
    // these two keys must live in persistCvNow.
    const persist = src.slice(src.indexOf("const persistCvNow"), src.indexOf("useEffect", src.indexOf("const persistCvNow")))
    const writes = [...src.matchAll(/localStorage\.setItem\("cvtailor:(cv|cv-filename)"/g)]
    const inPersist = [...persist.matchAll(/localStorage\.setItem\("cvtailor:(cv|cv-filename)"/g)]
    expect(writes.length, "a setItem for these keys escaped persistCvNow").toBe(inPersist.length)
  })

  it("a filename never outlives the document it named", () => {
    const persist = src.slice(src.indexOf("const persistCvNow"))
    // Text present, no name -> the name is REMOVED, not left behind.
    expect(persist.slice(0, 800)).toMatch(/else localStorage\.removeItem\("cvtailor:cv-filename"\)/)
  })
})

describe("a flush rescues work and can never destroy it", () => {
  it("clearing is a capability the exit path does not have", () => {
    expect(src).toMatch(/const persistCvNow = useCallback\(\(allowClear: boolean\)/)
    expect(src).toMatch(/\} else if \(allowClear\) \{/)
    // The debounce may clear: 800ms of an empty field is someone meaning it.
    expect(src).toMatch(/setTimeout\(\(\) => persistCvNow\(true\), 800\)/)
    // The exit may not: an unmount can precede the restore committing, and a
    // flush that cleared would delete the CV it exists to protect.
    expect(src).toMatch(/const flush = \(\) => persistCvNow\(false\)/)
  })

  it("flushes where a browser actually tells you it is leaving", () => {
    // pagehide fires where unload does not on mobile Safari; visibilitychange
    // covers a tab discarded in the background.
    expect(src).toMatch(/addEventListener\("pagehide", flush\)/)
    expect(src).toMatch(/addEventListener\("visibilitychange", onHide\)/)
    expect(src).toMatch(/document\.visibilityState === "hidden"/)
    // and on unmount, which is the ordinary navigation case
    const effect = src.slice(src.indexOf('addEventListener("pagehide"'))
    expect(effect.slice(0, 500)).toMatch(/return \(\) => \{[\s\S]{0,300}flush\(\)/)
  })
})

describe("the restore guard is honest", () => {
  it("reads current state, not the first render's closure", () => {
    const restore = src.slice(src.indexOf('localStorage.getItem("cvtailor:cv")'))
    expect(restore.slice(0, 400)).toMatch(/if \(saved && !latestCv\.current\.text\)/)
    expect(restore.slice(0, 400)).not.toMatch(/if \(saved && !cvText\)/)
  })

  it("the ref it reads is kept current", () => {
    expect(src).toMatch(/latestCv\.current = \{ text: cvText, name: cvFileName \}/)
    expect(src).toMatch(/\}, \[cvText, cvFileName\]\)/)
  })
})
