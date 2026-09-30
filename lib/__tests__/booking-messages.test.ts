/**
 * The booking doorway tells the truth about why something did not work.
 *
 * 28 Sep 2026: the page read ANY non-OK load as "That link is not valid" and
 * any non-OK choice as "That did not save". A rate limit (a second candidate
 * on the same network) is neither — the link is fine and saving again at
 * once will be refused again. And a second person picking the time the first
 * had just taken got 200 { outcome: "not_open" }, for which the page had no
 * words at all: their choice silently vanished.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import {
  autoRetryDelay,
  busyBody,
  doorwayLoadState,
  retryAfterSeconds,
  waitPhrase,
  tooManyAnswersMessage,
} from "@/lib/agency/doorway-messages"
import {
  NOT_SAVED_MESSAGE,
  TAKEN_MESSAGE,
  bookingAnswerMessage,
  bookingChoiceMessage,
} from "@/lib/agency/booking-messages"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("loading a doorway", () => {
  it("200 renders the page", () => {
    expect(doorwayLoadState({ status: 200, retryAfter: null })).toBeNull()
  })

  it("404 is the dead card", () => {
    expect(doorwayLoadState({ status: 404, retryAfter: null })).toEqual({ kind: "dead" })
  })

  it("429 is busy, not dead, and says how long", () => {
    const s = doorwayLoadState({ status: 429, retryAfter: 42, what: "your interview" })
    expect(s?.kind).toBe("busy")
    if (s?.kind !== "busy") return
    expect(s.title).toBe("This page is busy for a moment.")
    expect(s.body).toBe(
      "Several people on your connection are using Tailr right now. It will try again in 42 seconds."
    )
    expect(s.retryInSeconds).toBe(42)
  })

  it("busy never waits more than a minute to retry on its own", () => {
    const s = doorwayLoadState({ status: 429, retryAfter: 60 })
    expect(s?.kind === "busy" && s.retryInSeconds).toBe(60)
    expect(autoRetryDelay(0)).toBe(1)
    expect(autoRetryDelay(null)).toBeGreaterThan(0)
  })

  it("a day-long wait is 'later': no countdown, no retry every minute, the real time", () => {
    // 30 Sep 2026: the day bucket clamped to a 60s countdown that was refused
    // every time, under a card promising "in 60 seconds".
    const s = doorwayLoadState({ status: 429, retryAfter: 80_000 })
    expect(s?.kind).toBe("later")
    if (s?.kind !== "later") return
    expect(s.body).toMatch(/about 23 hours/)
    expect(s.body).toMatch(/still valid/)
    expect(s).not.toHaveProperty("retryInSeconds")
  })

  it("the countdown ends in words, not 'in 0 seconds'", () => {
    expect(busyBody(1)).toMatch(/in 1 second\.$/)
    expect(busyBody(0)).toMatch(/Trying again now/)
  })

  it("5xx and a network error offer a retry naming what failed", () => {
    for (const status of [500, 502, null]) {
      const s = doorwayLoadState({ status, retryAfter: null, what: "your interview" })
      expect(s?.kind).toBe("retry")
      expect(s?.kind === "retry" && s.title).toBe("We could not load your interview just now.")
    }
  })

  it("parses Retry-After in seconds", () => {
    expect(retryAfterSeconds("42")).toBe(42)
    expect(retryAfterSeconds(null)).toBeNull()
    expect(retryAfterSeconds("")).toBeNull()
    expect(retryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull()
  })
})

describe("choosing a time", () => {
  it("not_open — the second person on the same time — says it was taken", () => {
    expect(bookingChoiceMessage({ status: 200, outcome: "not_open", retryAfter: null })).toBe(TAKEN_MESSAGE)
  })

  it("taken — a truly simultaneous click — says the same", () => {
    expect(bookingChoiceMessage({ status: 200, outcome: "taken", retryAfter: null })).toBe(TAKEN_MESSAGE)
    expect(TAKEN_MESSAGE).toBe("That time has just been taken. The times below are the ones still free.")
  })

  it("a claim that worked says nothing", () => {
    expect(bookingChoiceMessage({ status: 200, outcome: "claimed", retryAfter: null })).toBeNull()
  })

  it("429 says to wait, with the seconds", () => {
    expect(bookingChoiceMessage({ status: 429, retryAfter: 42 })).toBe(
      "Too many tries from your connection just now. Wait 42 seconds, then choose again."
    )
  })

  it("a long Retry-After reads as time, not a number to count", () => {
    expect(waitPhrase(600)).toBe("10 minutes")
    expect(waitPhrase(80_000)).toBe("about 23 hours")
  })

  it("5xx and a network error say it did not save", () => {
    expect(bookingChoiceMessage({ status: 500, retryAfter: null })).toBe(NOT_SAVED_MESSAGE)
    expect(bookingChoiceMessage({ status: null, retryAfter: null })).toBe(NOT_SAVED_MESSAGE)
    expect(NOT_SAVED_MESSAGE).toBe("That did not save. Please try again.")
  })

  it("403 not_allowed keeps its plain wording", () => {
    expect(bookingChoiceMessage({ status: 403, outcome: "not_allowed", retryAfter: null })).toBe(NOT_SAVED_MESSAGE)
  })
})

describe("confirming or declining a fixed time", () => {
  it("gets the same 429 and 5xx wording", () => {
    expect(bookingAnswerMessage({ status: 429, retryAfter: 42 })).toMatch(/Wait 42 seconds/)
    expect(bookingAnswerMessage({ status: 503, retryAfter: null })).toBe(NOT_SAVED_MESSAGE)
    expect(bookingAnswerMessage({ status: null, retryAfter: null })).toBe(NOT_SAVED_MESSAGE)
  })

  it("keeps the server's own sentence for anything else", () => {
    expect(bookingAnswerMessage({ status: 400, retryAfter: null, error: "Choose an option" })).toBe("Choose an option")
    expect(bookingAnswerMessage({ status: 200, retryAfter: null })).toBeNull()
  })
})

describe("answering the consent question too often", () => {
  it("says how long to wait instead of \"That did not save\"", () => {
    expect(tooManyAnswersMessage(42)).toBe("You have changed this a few times just now. Wait 42 seconds, then save again.")
    expect(tooManyAnswersMessage(80_000)).toMatch(/Wait about 23 hours/)
    expect(tooManyAnswersMessage(null)).toMatch(/Wait 60 seconds/)
  })

  it("the consent page uses it for a 429", () => {
    const src = tsCode(readFileSync(join(process.cwd(), "app/consent/[token]/page.tsx"), "utf8"))
    expect(src).toMatch(/res\.status === 429[\s\S]{0,120}tooManyAnswersMessage\(/)
  })
})

describe("the pages use the mapping", () => {
  const booking = read("app/booking/[token]/page.tsx")

  it("the booking page no longer has a single `dead` flag for every failure", () => {
    expect(booking).not.toMatch(/setDead\(/)
    expect(booking).not.toMatch(/if \(!res\.ok\) return/)
    expect(booking).toMatch(/doorwayLoadState\(/)
    expect(booking).toMatch(/bookingChoiceMessage\(/)
    expect(booking).toMatch(/bookingAnswerMessage\(/)
    expect(booking).toMatch(/<DoorwayLoadIssue/)
  })

  for (const file of ["app/consent/[token]/page.tsx", "app/reference/[token]/page.tsx"]) {
    it(`${file} only calls a 404 invalid`, () => {
      const src = read(file)
      expect(src).not.toMatch(/if \(!res\.ok\) return setScreen\("invalid"\)/)
      expect(src).toMatch(/issue\?\.kind === "dead"\) return setScreen\("invalid"\)/)
      expect(src).toMatch(/<DoorwayLoadIssue/)
    })
  }

  it("the busy card retries on its own and offers 'Try again now'", () => {
    const card = read("components/agency/doorway-load-issue.tsx")
    expect(card).toMatch(/setTimeout\(/)
    expect(card).toMatch(/onRetry\(\)/)
    expect(card).toMatch(/Try again now/)
  })
})

describe("a window that slid inside the notice cutoff is not 'taken' (30 Sep 2026)", () => {
  it("too_soon says too soon", async () => {
    const { bookingChoiceMessage: m, TOO_SOON_MESSAGE, TAKEN_MESSAGE } = await import("@/lib/agency/booking-messages")
    expect(m({ status: 200, outcome: "too_soon", retryAfter: null })).toBe(TOO_SOON_MESSAGE)
    expect(m({ status: 200, outcome: "taken", retryAfter: null })).toBe(TAKEN_MESSAGE)
    expect(TOO_SOON_MESSAGE).not.toMatch(/taken/)
  })
})
