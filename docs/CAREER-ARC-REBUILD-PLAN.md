# Career Arc Rebuild — Staged Plan (locked 2 Aug 2026)

Approved by Ose 2 Aug 2026. Design of record: `mockups/career-arc-refined-tailr*.html`
(6 screens, all approved — Ledger structure × Tailr skin). Figma port owed when the
Figma MCP Starter quota resets — UI stages (2–5) wait for it; stage 1 (backend) does not.
External inspiration reviewed via Genspark; its "VERIFIED BY TAILR" language was
REJECTED — all trust language is **"NOTHING INVENTED"** (provenance, not truth-audit).

## Locked decisions

| Decision | Choice |
|---|---|
| Sequencing | Backend stage now; UI stages after Figma port |
| Card export | Client-side SVG→canvas, zero new dependencies |
| Public pages | `noindex` + rich OG tags (previews work, Google doesn't catalogue) |
| Editing | Constrained only: pin / hide / reorder / rephrase / add-from-CV (server-validated substring of stored CV). NO free-text editing — disclosed: old click-to-edit does not return |
| Skin boundary | Ledger chrome on arc + share surfaces only; tailor sidebar = standard Tailr components with mono-chip accents. Geist + Geist Mono only; mono never in body text |

## Stages

Every stage: build on a feature branch off `origin/staging` (fetch first — local refs
go stale), tarball verified-push, deploy to staging, Ose tests, PROJECT.md + Notion
updated. `git status` → `git reset` before every commit (index-desync hazard).
Never merge to main without explicit instruction.

### Stage 1 — Evidence bank backend (no UI) · CAN START NOW
- Migration 019 (SQL below) — Ose pastes into **tailr-staging** SQL Editor.
- Upgrade `/api/career-profile` extraction: emit evidence cards (category, claim,
  source role/company/span, cv_line). Keep no-invention tool rules, forced tool_choice,
  server-side validation, `maxDuration = 300`, `checkRateLimit`.
- New PATCH actions: `pin`, `hide`, `reorder`, `rephrase`, `add-from-cv`
  (add-from-cv rejects any text not found as a substring of the stored CV).
- Usage counts computed from `tailor_history` at read time, not stored.
- Verify: real-CV E2E on staging (also pays down the standing no-E2E debt).

### Stage 2 — Private arc page (screens 01 + 02) · AFTER FIGMA PORT
- Rebuild `app/career-arc/page.tsx` to the approved skin: ledger head + NOTHING
  INVENTED stamp, at-a-glance (incl. reuse stat), path chart (chapters; breaks as
  entries "recorded, not counted against you"), evidence bank grid w/ pinned card,
  hover actions, add-from-CV, notes, tailor bridge.
- Thin-CV state: chapter list replaces chart under 3 working chapters.
- Reveal wizard kept as-is (restyle later if desired).
- Reuse existing patterns: `useInView`, `useCountUp`, `Reveal`, `readJson`.

### Stage 3 — Sharing (screens 03 + 06) · SECURITY SWEEP GATE
- Migration 020: `arc_shares` (token 128-bit random, per-claim redactions jsonb,
  identity toggles, `expires_at` default +90d extendable, `revoked_at`). RLS.
- `/api/arc-share`: POST create/update, GET settings, DELETE revoke. Auth + 401s.
- `app/arc/[token]/page.tsx`: public, server-rendered with redactions applied
  server-side (raw values never reach the client); expired/revoked → 404;
  `noindex` robots meta + OG tags; career break excluded unless toggled on.
- **Play 1 security sweep on this stage before it deploys.** Verify: unauth GET
  works, revoked token 404s, redacted page contains no raw employer/number strings
  in the HTML source.

### Stage 4 — Share cards (screen 04)
- 5-card set (Cover / Number / Proudest / Path / CTA) rendered as SVG in the share
  modal, rasterised via canvas → PNG download. No new dependencies. Cards apply
  the live redaction state. No quantified claim → card 2 skipped (set of 4), never faked.

### Stage 5 — Tailor sidebar (screen 05)
- `/api/tailor` extract pass extended: JD requirements list, matched evidence ids,
  named gaps. Sidebar: 7-of-9 style segmented coverage meter, requirements with
  EV-chip traceability, gap cards → existing `add-skill` mode on `/api/career-path`.
  Money path untouched — same guard as the career-sync feedback edge.

## Migration 019 (stage 1 — paste into tailr-staging SQL Editor)

```sql
-- 019_career_evidence.sql · evidence bank for Career Arc rebuild
create table if not exists career_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references career_profiles(id) on delete cascade,
  category text not null check (category in ('quant','scope','leadership','systems','craft')),
  claim text not null,
  source_role text not null default '',
  source_company text not null default '',
  source_span text not null default '',
  cv_line int,
  pinned boolean not null default false,
  hidden boolean not null default false,
  rephrased_text text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table career_evidence enable row level security;

do $$ begin
  create policy "career_evidence_select" on career_evidence
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "career_evidence_insert" on career_evidence
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "career_evidence_update" on career_evidence
    for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "career_evidence_delete" on career_evidence
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists career_evidence_user_idx on career_evidence(user_id, sort_order);
```

(Also add this as `supabase/migrations/019_career_evidence.sql` on the feature
branch when stage 1 code starts. Prod gets it only at port time, per the
migrations-before-code rule.)

## Session bootstrap for whoever builds stage 1

1. Work from `~/dev/cvtailor-saas` (iCloud copy is stale — mockups + this plan
   were synced here 2 Aug).
2. `git fetch origin` → branch off `origin/staging` (e.g. `feat/arc-evidence-bank`).
   One agent per branch; check AGENTS.md.
3. `git status` first; if the whole app shows staged-deleted, `git reset`.
4. Read the approved mockups in `mockups/career-arc-refined-tailr*.html` before
   touching UI, and `docs/PROJECT.md` for context.
```
