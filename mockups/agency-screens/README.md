# Tailr for Agencies — screen mockups

Eight self-contained HTML files, one per screen of the agency product. Open
any of them in a browser; they need no server and no build. The bar across
the top links between screens.

| File | Screen |
|---|---|
| `01-role-intake.html` | Step 01 · Role intake |
| `02-parse-review.html` | Step 02 · Parse review |
| `03-add-candidates.html` | Step 03 · Add candidates |
| `04-screening-calls.html` | Step 04 · Screening calls |
| `05-compare.html` | Step 05 · Compare |
| `06-candidate-detail.html` | Step 06 · Candidate detail |
| `07-client-submission.html` | Step 07 · Client submission |
| `08-dashboard.html` | `/agencies` dashboard (dark theme) |

## What these are

Generated from `app/agencies/agencies.css` as it stands on `staging`, so they
show the product as actually built rather than an aspiration. The content is
realistic sample data for one role (Meridian, ROL-2418) carried consistently
across all eight screens: the same four candidates, the same nine
requirements, the same scores and the same single recruiter override, so the
flow reads as one continuous story.

They are static. Nothing is clickable except the nav bar.

## Fonts

The app loads Geist, Geist Mono and Fraunces through `next/font`. A
standalone file cannot, so these pull the same three from Google Fonts and
fall back to system faces offline. Everything else is inlined.

## Why these exist

The original design handoff lived in `mockups/agency-prototype/` in a local
checkout and was **never committed**. That checkout is gone, and with it the
canonical source for seven screens. These files are the replacement of record.
If you regenerate them after a design change, commit them.
