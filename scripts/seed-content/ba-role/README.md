# Seed content — Business Analyst (ROL-2419), twenty candidates

Paste-ready CVs for the Business Analyst role at Meridian health, written to
the role's ten parsed requirements (R01–R10). Six strong, seven middling, five
weak, plus two edge cases: can-19 is the same person as can-01 (older CV, same
email) to exercise the duplicate banner, and can-20 carries no contact details
to exercise the no-contact-details notice path.

Seed them through the real ingest path with `scripts/seed-candidates.ts`
(dry-run first). Every candidate is fictional; emails are founder plus-addresses
as in the sibling folder, so Art. 14 notices land with the founder.

Note after the first run (24 Sep 2026): ROL-2418 already carried synthetic
candidates on the same first three plus-addresses, so can-01, can-02 and
can-03 are flagged "Also in your pipeline" against that role as well. That is
agency-wide duplicate detection working, not a fault — and a useful thing to
see on a test shortlist. Verified by comparing the stored emails and identity
hashes on both roles.
