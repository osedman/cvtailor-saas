# Tailr — working rules

Rules for any AI agent working in this repo. These are not suggestions; each
one was written after it cost us something.

## Design

**Figma is the design source of truth. Use it for every UI change.**

Before writing code for anything a user will look at — a new screen, a new
section, a restyle — go to Figma first:

1. Check whether a frame for this already exists (`figma-use` / search the
   Tailr file). If it does, build to it rather than inventing.
2. If it doesn't, create the design in Figma (`figma-generate-design` or
   `figma-create-new-file`) and get Ose's sign-off on the frame BEFORE
   implementing.
3. Implement from the frame, then verify in the browser against it.

Never ship UI designed only in your head or only in a chat mockup. Inline
mockups (the visualize widget) are for *fast concept comparison when Figma is
unavailable* — they are a fallback, not the process.

**If the Figma connector is not authorized, say so and stop** rather than
quietly substituting your own design. Ose authorizes it in claude.ai →
connector settings.

**Then measure, don't eyeball.** After implementing, run the
`web-design-guidelines` skill and check the real rendered page in the browser
(desktop + mobile widths). "Looks right" is not verification.

**Brand tokens** (do not invent new ones): ink `#1e1813`, coral `#dc4f33`,
coral-deep `#b3341b`, cream `#f9f6f0`, paper `#fdfcf9`, tint-1 `#fff7f4`,
tint-2 `#f5d9d0`, border `#eee6da`. The `ns-` design system in
`app/globals.css` owns the North Star surfaces — extend it, don't bypass it.

**Typography is the design system's, never mono.** A guardrail test
(`lib/__tests__/typography-consistency.test.ts`) fails the build on any new
monospace usage outside its allowlist. Users read mono as "robotic" and
off-brand; CV surfaces render in the selected template's face so what you edit
is what you download.

## Verification

**Verify the effect, never the status code.** A route that can answer
`200 {enabled:false}` makes a broken integration look identical to a working
one in the logs. Check the thing that should have changed — a row written, a
value rendered — before saying something works.

**Env vars in Vercel are scoped.** A variable set while working on staging is
**Preview**-scoped and production will not see it. Shipping a feature to prod
means ticking Production on that variable explicitly. This cost three rounds of
"still not working" on 28 Jul 2026.

**Migrations run manually, in both environments**, and always BEFORE the code
that reads them. Tell Ose exactly what SQL to run and in which project.

## Multi-agent

Claude Code, Cursor and ChatGPT all touch this repo. Before any commit, run
`git status` — if you see the whole app staged as deletions, run `git reset`
(safe). Check you are on the branch you think you are: a commit landed on
another agent's feature branch on 28 Jul because they pushed mid-task.

## Tracking

Every change gets a row in `docs/PROJECT.md` AND a card on the Notion board
(data source `4dd8b2b7-23f0-48a5-92a3-4ffdfbb32fa6`). Both, every time.

## Never

- Merge to `main` or ship to production without Ose saying so explicitly.
- Put PII (user emails, CV text, subscriber lists) or secrets in tool output.
- Scrape a site whose ToS forbids it — use the official API or don't ship it.
