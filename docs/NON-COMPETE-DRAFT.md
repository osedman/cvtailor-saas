# Draft: Tailr's commitment to agencies — DRAFT, NOT PUBLISHED

**Status: draft for Ose's sign-off, 22 Aug 2026.** This is a public promise,
which makes it a legal-adjacent artifact: nothing here goes on a website or
into a sales conversation until signed off, and ideally not before the lawyer
who reads the consent copy reads this too. The 20 Aug gap it answers: "a
stated non-compete commitment for agencies evaluating a product whose vendor
also runs a candidate platform."

The rule followed in drafting: **every sentence is checkable against the
codebase today.** No aspiration, no "we would never" that is not also a
grant, a wall, or a test. Where the honest answer is unflattering (one
database), it is stated rather than dressed.

---

## Your candidates are not our candidates

Tailr runs two products: a career tool people use for themselves, and this
one, which your agency uses to run its desk. It is fair to ask whether the
company behind both is quietly feeding one with the other. This page is the
answer, and each claim names the mechanism behind it, because a promise you
cannot check is marketing.

**1. We do not recruit from your pool.** A candidate you upload exists only
in your agency's workspace. They are never shown a Tailr account, never
invited to one, and never marketed to. The email they get about your role is
sent in your name, says only what the law requires it to say, and its links
go to pages with no product on them.
*Mechanism: agency data lives in its own schema with no route into consumer
surfaces; candidate emails come from your agency's sender name; every
candidate-facing page is a bare doorway with no sign-up path on it.*

**2. Your pipeline is invisible to us as a competitor.** Who you are
screening, what you concluded, what your client said — none of it feeds any
Tailr feature outside your workspace. Not matching, not analytics, not
anybody else's shortlist.
*Mechanism: the matching feature reads only roles you chose to publish, and
publishes only the requirement list — never your candidates, your notes, or
your client's name without your say-so.*

**3. When a Tailr user reaches your role, they chose to.** Matching runs on
the person's own device against roles you published. Nobody browses Tailr's
users; nothing about a person crosses to you until they read exactly what
would be shared and pressed apply. The consent record is theirs, dated, and
yours to keep.
*Mechanism: the scan runs candidate-side; an application writes candidate,
consent event and audit row in one transaction, or nothing at all.*

**4. One person, two hats, two walls.** A recruiter who also uses Tailr for
their own career holds two separate sessions that cannot see each other, on
principle and by cookie scope — even a person entitled to both sides gets no
bridge between them.
*Mechanism: the agency product's session is host-only and never shares the
consumer cookie; which product a request belongs to is read from the host,
grants nothing, and is re-checked against the database every time.*

**5. The honest limit.** Both products run on one infrastructure and, today,
one database — separated by schema, by grants and by tests that fail the
build when a wall is touched, but one database. If your diligence needs
physically separate storage, say so: that is a real piece of work we would
price rather than promise, and this paragraph exists so that conversation
starts honestly.

**6. If we ever change this**, the change comes to you in writing before it
happens, not in a changelog after it.

---

## Sign-off checklist

- [ ] Ose reads every claim against the codebase notes above
- [ ] Claim 5's framing (one database, said plainly) — comfortable?
- [ ] Lawyer pass alongside the consent copy (same session, cheaper)
- [ ] Then: where it lives — agencies marketing page, onboarding, or both
