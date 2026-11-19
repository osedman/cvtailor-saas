/**
 * The consent emails (frame 47 §B and §E, signed off 14 Nov 2026) and the
 * told-first submission gate.
 *
 * What the frame promised, checked on the rendered HTML:
 *   - every email names the employer and carries the rights link;
 *   - the put-forward ask carries the cleared Art 14 notice on first contact;
 *   - no button answers anything — recording links carry only the `?a=` hint
 *     the consent page acknowledges in words, never a decision.
 */
import { describe, it, expect, vi } from "vitest"
import {
  art14NoticeHtml,
  renderCandidateMail,
  type CandidateMail,
  type CandidateMailContext,
} from "../agency/candidate-mail"
import { noticeHtml } from "../agency/notices"

const CTX: CandidateMailContext = {
  candidateId: "cand-1",
  agencyId: "agency-1",
  roleId: "role-1",
  email: "amara@example.com",
  firstName: "Amara",
  agencyName: "Halcyon Search",
  replyTo: "jo@halcyon.example",
  roleTitle: "Product Owner",
  company: "Meridian Health",
  retentionDays: 180,
  source: "paste",
}
const RIGHTS = "https://app.example/rights/abc"
const CONSENT = "https://app.example/consent/tok"

const ALL: CandidateMail[] = [
  { kind: "recording_request", when: "Tuesday 18 November, 10:00", consentUrl: CONSENT },
  { kind: "recording_receipt", answer: "granted", when: "Tuesday 18 November, 10:00", consentUrl: CONSENT },
  { kind: "recording_receipt", answer: "declined", when: "Tuesday 18 November, 10:00", consentUrl: CONSENT },
  { kind: "recording_reminder", when: "Tuesday 18 November, 10:00", consentUrl: CONSENT },
  { kind: "recording_deleted", roundDate: "18 Nov" },
  { kind: "represent_ask", withNotice: true },
  { kind: "represent_ask", withNotice: false },
  { kind: "represent_reminder" },
  { kind: "represent_receipt", answer: "agreed" },
  { kind: "represent_receipt", answer: "declined" },
  { kind: "represent_receipt", answer: "withdrawn" },
]

describe("every consent email", () => {
  for (const mail of ALL) {
    const label = `${mail.kind}${"answer" in mail ? `:${mail.answer}` : ""}${"withNotice" in mail ? `:${mail.withNotice}` : ""}`
    it(`${label} names the employer and carries the rights link`, () => {
      const { subject, html } = renderCandidateMail(CTX, mail, RIGHTS)
      expect(`${subject} ${html}`).toContain("Meridian Health")
      expect(html).toContain(RIGHTS)
      expect(html).toContain("Halcyon Search")
    })
  }

  it("never puts a decision in a link — recording links carry only the ?a= hint", () => {
    for (const mail of ALL) {
      const { html } = renderCandidateMail(CTX, mail, RIGHTS)
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
      for (const href of hrefs) {
        expect(href).not.toMatch(/decision=|answer=|represent=|agree/)
        if (href.startsWith(CONSENT)) expect(href).toMatch(new RegExp(`^${CONSENT}(\\?a=(yes|no))?$`))
      }
    }
  })

  it("escapes names it did not write", () => {
    const { html } = renderCandidateMail(
      { ...CTX, company: "<script>x</script>", firstName: "<b>" },
      { kind: "represent_ask", withNotice: false },
      RIGHTS
    )
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<b>")
  })
})

describe("the Art 14 items cleared on 14 Nov 2026", () => {
  const items = [
    "legitimate interest",
    "Anthropic",
    "United States",
    "International Data Transfer Addendum",
    "object to us using it",
    "ico.org.uk",
    "180 days",
  ]

  it("are in the put-forward ask when it is first contact, and only then", () => {
    const first = renderCandidateMail(CTX, { kind: "represent_ask", withNotice: true }, RIGHTS).html
    const later = renderCandidateMail(CTX, { kind: "represent_ask", withNotice: false }, RIGHTS).html
    for (const item of items) {
      expect(first).toContain(item)
      expect(later).not.toContain("ico.org.uk")
    }
  })

  it("are in the day-7 notice", () => {
    const html = noticeHtml({
      candidateName: "Amara Okafor",
      agencyName: "Halcyon Search",
      roleTitle: "Product Owner",
      roleLocation: "London",
      retentionDays: 180,
      personalNote: "",
      rightsUrl: RIGHTS,
      replyTo: "jo@halcyon.example",
      source: "paste",
    })
    for (const item of items) expect(html).toContain(item)
  })

  it("say where the CV came from", () => {
    expect(art14NoticeHtml({ agencyName: "H", replyTo: "", source: "matched", retentionDays: 30 })).toContain("when you applied")
    expect(art14NoticeHtml({ agencyName: "H", replyTo: "", source: "paste", retentionDays: 30 })).toContain("shared with us")
  })
})

describe("told first: nobody's CV reaches an employer before they have been told", () => {
  const admin = vi.hoisted(() => ({ from: vi.fn() }))

  function table(result: unknown) {
    const chain: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "is", "not"]) chain[m] = () => chain
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
    return chain
  }

  it("counts applied, noticed and asked as told — and nobody else", async () => {
    const { untoldRefs } = await import("../agency/put-forward")
    admin.from.mockImplementation((t: string) =>
      t === "candidates"
        ? table({
            data: [
              { id: "a", ref: "CAN-01", source: "matched", represent_asked_at: null },
              { id: "b", ref: "CAN-02", source: "paste", represent_asked_at: null },
              { id: "c", ref: "CAN-03", source: "paste", represent_asked_at: "2026-11-14T10:00:00Z" },
              { id: "d", ref: "CAN-04", source: "paste", represent_asked_at: null },
              { id: "e", ref: "CAN-05", source: "paste", represent_asked_at: null },
            ],
            error: null,
          })
        : table({
            data: [
              { candidate_id: "b", status: "sent" },
              { candidate_id: "d", status: "scheduled" },
              { candidate_id: "e", status: "suppressed" },
            ],
            error: null,
          })
    )
    const refs = await untoldRefs(admin as never, ["a", "b", "c", "d", "e"])
    // Scheduled is not sent; suppressed is not told.
    expect(refs).toEqual(["CAN-04", "CAN-05"])
  })

  it("the submission route refuses the untold with no override parameter that skips it", async () => {
    const { readFileSync } = await import("fs")
    const src = readFileSync("app/api/agency/roles/[roleId]/submission/route.ts", "utf8")
    const gate = src.slice(src.indexOf("untoldRefs("), src.indexOf("checkRepresentGate(admin"))
    expect(gate).toContain("status: 409")
    // Nothing from the request body can reach this gate.
    expect(gate).not.toMatch(/body\?\.|representOverride|overrideUnanswered/)
    // And it runs before the represent gate and anything that renders.
    expect(src.indexOf("untoldRefs(")).toBeLessThan(src.indexOf("checkRepresentGate(admin"))
  })
})
