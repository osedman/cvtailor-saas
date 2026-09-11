# Next session: the recruiter sidebar shows too much at once

_Written 11 September 2026, at the end of the session that caused it._

## Paste this as the opening prompt

> The recruiter sidebar in Tailr's B2B product shows four stacked lists and
> about eighteen interactive items at once, and it does it even when I am
> deep inside one step of one role. Fix it with progressive disclosure: the
> sidebar should show the level I am working at, not every level at once.
>
> Read `docs/NEXT-SESSION-NAV.md` first — it has the evidence, the rules I
> want, what must not regress, and how to verify. Read the `tailr-playbook`
> and `tailr-b2b` skills before touching anything.
>
> This is a UI change, so per CLAUDE.md it goes to Figma first and needs my
> sign-off on the frame before implementation.

## What it looks like today

On `/agencies/roles/[roleId]` (the shortlist workflow, step 01) the sidebar
renders, top to bottom:

| Group | Items |
|---|---|
| — | Brand, agency switcher |
| **NAVIGATE** | Today · Roles · Candidates · Client briefs |
| **YOUR DESK** | Client access · Audit log · Settings · Notifications |
| **THIS ROLE** | Shortlist flow · Interviews · Close-out |
| **SHORTLIST WORKFLOW** | 01 Role intake … 07 Client submission |
| — | Sign out, footer note |

Four labelled groups, eighteen things to click, on a screen whose whole job
is "paste the job description".

**It is also saying the same thing twice.** The role header already carries
the phase rail top-right — `SHORTLIST · INTAKE` / `INTERVIEWS` / `HANDOVER`
— which is the same information as the sidebar's **THIS ROLE** group, in a
better place.

## How it got this way (so you do not undo the fixes)

Three separate, individually-reasonable changes stacked up in one week:

1. **3 Sep** — every role screen got the global nav, because the workflow
   and candidate-detail pages previously had *no* route navigation at all:
   Briefs, Clients, Audit and Settings were unreachable from the screen
   recruiters spend most of their time on.
2. **11 Sep** — the eight global items were split into two labelled groups
   (**Navigate** / **Your desk**) because eight flat items read as a list
   rather than a navigation.
3. **11 Sep, later** — `RoleRail` (**This role**) was added to the workflow
   and candidate-detail screens because from there you could not reach
   Interviews or Close-out at all. That was a genuine dead end.

Each fixed something real. Together they are the problem. **Do not solve
this by reverting any of them** — reintroducing the dead end or hiding
Client briefs again would be trading one fault for an older one.

## The rules I want

1. **One level at a time, with a way up.** Inside a role, the global list
   collapses to a single back link (something like "← All roles"). It does
   not need to list eight destinations while I am inside one.
2. **"Your desk" never appears inside a role.** Client access, Audit log,
   Settings and Notifications are desk-level and have no business on a
   role screen.
3. **The seven steps appear only on the shortlist-flow screens** — the
   workflow page and candidate detail. Not on Interviews, Close-out or the
   dossier, where they describe work that is finished.
4. **Decide between the sidebar's "This role" and the header's phase rail.**
   They carry the same three destinations. Keep one. The header is the
   stronger candidate: it is already in the eye-line and already says which
   phase is current.
5. **Never more than two labelled groups visible at once.**
6. The role's identity (title, ref) should be visible while inside it —
   today the sidebar's "Active role" box was removed and only the header
   carries it, which is probably right, but check it survives the change.

## What must not regress

- **No dead ends.** Every role screen must still reach the role's other
  phases, and every global destination must still be reachable within one
  click of the back link. `lib/__tests__/self-booking-consistency.test.ts`
  pins the rails; `lib/__tests__/agency-nav.test.ts` pins the global nav.
- **The Client briefs count.** The badge is cross-agency and is the only
  thing that surfaces a brief waiting in another of your agencies. It was
  added after four briefs sat unseen for a week — see
  `lib/__tests__/briefs-visibility.test.ts`.
- **`AgencyNav` on every `/agencies/**` page** except `sign-in`. Pinned.
- **The candidate-detail step rail must not claim progress.** It shows plain
  numbers on purpose: that page cannot know what is done, and it used to
  hard-code a tick on every step but its own.

## Files

- `components/agency/agency-nav.tsx` — the global nav, two groups
- `components/agency/role-rail.tsx` — "This role"
- `components/agency/phase-rail.tsx` — the header chips
- `components/agency/role-header.tsx` — renders the phase rail
- `app/agencies/roles/[roleId]/page.tsx` — the worst case: all four lists
- `app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx` — same
- `app/agencies/roles/[roleId]/{interviews,close-out}/page.tsx`,
  `.../candidates/[candidateId]/dossier/page.tsx` — role rail, no steps
- `app/agencies/agencies.css` — `.ag-rail-group`, `.ag-nav-group`, `.ag-step`

## Also worth looking at while you are there

- **The hiring-manager nav is the opposite problem**: Home · Interviews ·
  Send a brief, and a role's own cohort screen has no entry of its own (it
  lights Interviews by a path match). Fine for now, but check it reads
  sensibly beside whatever you do to the recruiter side.
- **The workflow screen's own header** repeats itself: the role header, then
  a Back/Next bar, then "STEP 01 · ROLE INTAKE", then an H1. That is four
  pieces of chrome before any content.

## Verify

- Typecheck, `npx vitest run`, and a production build with placeholder env.
- Walk it on staging on both hats: a role in each of the three phases, and
  check that from every role screen you can reach the other two phases and
  get back out to the global level.
- Run the `web-design-guidelines` skill on the changed screens, desktop and
  mobile widths.
