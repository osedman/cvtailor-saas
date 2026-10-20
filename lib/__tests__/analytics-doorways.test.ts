/**
 * Analytics must not measure the token doorways.
 *
 * Two properties, and the second is the one that matters. Dropping a doorway
 * pageview is a purpose-limitation point: a candidate exercising a right is
 * not a product user. Dropping it *by URL inside beforeSend* is a leak point:
 * those paths carry a live secret, and an analytics record is somewhere we
 * cannot purge it from.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { isTokenBearing, __TOKEN_BEARING } from "@/components/analytics"

describe("token-bearing paths", () => {
  it("covers every doorway that puts a secret in the URL", () => {
    // If a new doorway is added, it belongs here. The routes are:
    // /consent /reference /rights /portal (agency) and /arc (consumer share).
    expect([...__TOKEN_BEARING].sort()).toEqual(
      ["/arc", "/consent", "/portal", "/reference", "/rights"].sort()
    )
  })

  it("matches the doorway and everything under it", () => {
    expect(isTokenBearing("/consent")).toBe(true)
    expect(isTokenBearing("/consent/abc123")).toBe(true)
    expect(isTokenBearing("/reference/tok/thanks")).toBe(true)
    expect(isTokenBearing("/arc/xyz")).toBe(true)
  })

  it("does not swallow ordinary product paths that merely share a prefix", () => {
    expect(isTokenBearing("/tailor")).toBe(false)
    expect(isTokenBearing("/agencies")).toBe(false)
    // The trap: startsWith without the slash would drop these two.
    expect(isTokenBearing("/portfolio")).toBe(false)
    expect(isTokenBearing("/consenting-adults")).toBe(false)
  })
})

describe("the doorway drop is wired into beforeSend, not just render", () => {
  const source = readFileSync(join(process.cwd(), "components/analytics.tsx"), "utf8")

  it("passes a beforeSend that can return null", () => {
    // Render-time filtering alone loses the race with a client-side
    // navigation: the event fires before the component re-renders.
    expect(source).toMatch(/beforeSend=/)
    expect(source).toMatch(/isTokenBearing\(pathnameOf\(event\.url\)\)/)
  })

  it("is what the root layout actually renders", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8")
    expect(layout).toMatch(/<ProductAnalytics\s*\/>/)
    // The bare component would measure the doorways again.
    expect(layout).not.toMatch(/<Analytics\s*\/>/)
  })
})
