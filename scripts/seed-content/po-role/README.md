# Seed content — Product Owner, Digital Patient Services, twenty candidates

Paste-ready CVs for the Product Owner, Digital Patient Services role at
Meridian Health (recruited through Halcyon Search; London, hybrid), written to
the ten requirements in `00-job-description.txt` (R01–R10: six must-haves, four
nice-to-haves). Six strong (po-01 to po-06), seven middling (po-07 to po-13),
five weak (po-14 to po-18), plus two edge cases: po-19 is the same person as
po-01 (older, shorter CV from three years earlier, same name and email) to
exercise the duplicate banner, and po-20 carries no contact details at all
(name and location only) to exercise the no-contact-details notice path.

**On staging the role already exists: `ROL-2421`** (Halcyon Search, contact
Meridian Health, draft, 2 rounds). It was created in SQL on 29 Sep 2026 with
R01–R10 entered from the JD (origin `recruiter`, not parsed) and a SEEDED
FIXTURE audit row. **Seeded 29 Sep 2026: CAN-01 to CAN-20 are already in** (assessed in-session
without an API key, scored with the real `computeScore` and `inputsHash`, so the
hashes verify). Don't run the script again against ROL-2421. Use `ROL-XXXX`
below only for a fresh role. Anywhere else, create
the role by pasting `00-job-description.txt` at Step 01 · Role intake.

**Standing test fixture — keep until Ose says otherwise.** ROL-2421, its
candidates, and Ose's two consumer accounts (gmail and lean-frame, both opted
in to matching) are the test set. Do not close or discard ROL-2421: closing
starts the retention clock (`retention_expires_at`), and the nightly
`purge_expired()` then erases the candidates. Do not delete, withdraw or
re-seed them.

Seed the candidates through the real ingest path with
`scripts/seed-candidates.ts`, dry-run first:

    npx tsx --tsconfig tsconfig.json --env-file=.env.development.local scripts/seed-candidates.ts --role ROL-XXXX --dir scripts/seed-content/po-role --dry

then for real:

    npx tsx --tsconfig tsconfig.json --env-file=.env.development.local scripts/seed-candidates.ts --role ROL-XXXX --dir scripts/seed-content/po-role

Every candidate and employer is fictional. Emails are founder plus-addresses
(`o.oifoh+poNN@gmail.com`), so Art. 14 notices land with the founder, and phone
numbers are from the Ofcom drama range (07700 900201–900218).
