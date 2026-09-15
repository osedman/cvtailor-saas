/**
 * The seeding script must not be able to point at production.
 *
 * On 15 September 2026 the first draft of `scripts/seed-walkthrough.mjs`
 * imported `loadMailEnv` from the mailers' helper because it was already
 * there and already parsed .env files. That helper reads `.env.mail.local`
 * FIRST, and its own docstring says why: it is "for the mailers only ... so
 * production credentials can live there for a send without repointing the
 * local dev server". On this machine that file holds the service-role key for
 * the CONSUMER PRODUCTION database.
 *
 * So a fixture-seeding tool, aimed at staging, silently resolved to
 * production. What caught it was the allow-list — and the allow-list only
 * caught it because it names the project the tool IS for. The draft before
 * that had a DENY-list containing a production ref that had been guessed
 * rather than looked up: a guard that reads as protection and protects
 * nothing, because it would have waved through the very project it hit.
 *
 * These pin both halves of that lesson.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const PATH = "scripts/seed-walkthrough.mjs"
const raw = () => readFileSync(join(process.cwd(), PATH), "utf8")
/** Comments stripped — a "does not read" guard must not match the comment
 *  explaining why it does not read it. */
const code = () => raw().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("the seeding script cannot wander into production", () => {
  it("exists", () => {
    expect(existsSync(join(process.cwd(), PATH))).toBe(true)
  })

  it("never reads the mailers' env file, which holds production credentials", () => {
    expect(code()).not.toMatch(/\.env\.mail\.local/)
    expect(code()).not.toMatch(/loadMailEnv|mail-env/)
  })

  it("decides by allow-list, so an unknown project is refused by default", () => {
    const src = code()
    expect(src).toMatch(/KNOWN_STAGING/)
    // The inverse — a deny-list of production refs — is what the first draft
    // had, and it let the real production project straight through.
    expect(src).not.toMatch(/PROD_REFS|DENY|BLOCKLIST/i)
    expect(src).toMatch(/!KNOWN_STAGING\.includes\(projectRef\)/)
  })

  it("offers a --dry that writes nothing", () => {
    const src = code()
    expect(src).toMatch(/--dry/)
    expect(src).toMatch(/if \(dry\) return/)
  })

  it("stamps what it writes as a fixture, with nobody's name on it", () => {
    const src = code()
    expect(src).toMatch(/SEEDED FIXTURE/)
    // Attributing seeded rows to a person is a lie in a trail whose whole
    // job is saying who did what.
    expect(src).toMatch(/actor_id: null/)
  })

  it("never clones a database-generated unique column", () => {
    // rights_token is a candidate's private door to their own data. Copying
    // it both fails the unique index AND would hand two people one door.
    expect(code()).toMatch(/rights_token/)
    expect(raw()).toMatch(/never clone a column the database generates/)
  })

  it("does not delete anything it did not just create", () => {
    const src = code()
    const deletes = [...src.matchAll(/\.delete\(\)/g)]
    // Exactly one: the rollback of a role this script created seconds earlier
    // when its candidates fail. Any other delete needs its own argument.
    expect(deletes.length).toBe(1)
    expect(src).toMatch(/from\("job_roles"\)\.delete\(\)\.eq\("id", roleId\)/)
  })
})
