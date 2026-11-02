/**
 * The "Viewing as" switch vanished for the founder on staging (19 Oct 2026).
 * The shell mounts the switch on /agencies/sign-in, so its first ask is made
 * signed out and gets a 401; that "neither" was cached for the session, and
 * signing in with a code moves on client-side, so nothing ever asked again.
 * A failed ask must never be remembered.
 */
import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const respond = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))

describe("loadHats", () => {
  it("does not remember a signed-out answer — the next ask after sign-in gets the real hats", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => respond(401, { recruiter: false, hiringManager: false }))
      .mockImplementationOnce(() => respond(200, { recruiter: true, hiringManager: true }))
    vi.stubGlobal("fetch", fetchMock)
    const { loadHats } = await import("@/components/agency/hat-switch")

    expect(await loadHats()).toEqual({ recruiter: false, hiringManager: false })
    expect(await loadHats()).toEqual({ recruiter: true, hiringManager: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not remember a network failure either", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("offline")))
      .mockImplementationOnce(() => respond(200, { recruiter: true, hiringManager: true }))
    vi.stubGlobal("fetch", fetchMock)
    const { loadHats } = await import("@/components/agency/hat-switch")

    expect(await loadHats()).toEqual({ recruiter: false, hiringManager: false })
    expect(await loadHats()).toEqual({ recruiter: true, hiringManager: true })
  })

  it("remembers a signed-in answer, so navigating does not ask again", async () => {
    const fetchMock = vi.fn(() => respond(200, { recruiter: true, hiringManager: false }))
    vi.stubGlobal("fetch", fetchMock)
    const { loadHats } = await import("@/components/agency/hat-switch")

    await loadHats()
    expect(await loadHats()).toEqual({ recruiter: true, hiringManager: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
