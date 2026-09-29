# Seed content — Product Owner, Digital Patient Services, twenty candidates

Paste-ready CVs for the Product Owner, Digital Patient Services role at
Meridian Health (recruited through Halcyon Search; London, hybrid), written to
the ten requirements in `00-job-description.txt` (R01–R10: six must-haves, four
nice-to-haves). Six strong (po-01 to po-06), seven middling (po-07 to po-13),
five weak (po-14 to po-18), plus two edge cases: po-19 is the same person as
po-01 (older, shorter CV from three years earlier, same name and email) to
exercise the duplicate banner, and po-20 carries no contact details at all
(name and location only) to exercise the no-contact-details notice path.

Create the role first by pasting `00-job-description.txt` at Step 01 · Role
intake, and check at Step 02 that the parser pulled out all ten requirements.
The role gets a ref (`ROL-XXXX` below) when it is created; use that ref in the
commands.

Seed the candidates through the real ingest path with
`scripts/seed-candidates.ts`, dry-run first:

    npx tsx --tsconfig tsconfig.json --env-file=.env.development.local scripts/seed-candidates.ts --role ROL-XXXX --dir scripts/seed-content/po-role --dry

then for real:

    npx tsx --tsconfig tsconfig.json --env-file=.env.development.local scripts/seed-candidates.ts --role ROL-XXXX --dir scripts/seed-content/po-role

Every candidate and employer is fictional. Emails are founder plus-addresses
(`o.oifoh+poNN@gmail.com`), so Art. 14 notices land with the founder, and phone
numbers are from the Ofcom drama range (07700 900201–900218).
