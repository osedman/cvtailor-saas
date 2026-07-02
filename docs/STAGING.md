# Staging environment

Tailr has a persistent staging environment for testing changes before they reach production.

## URLs / infra

- **Vercel branch:** `staging` (auto-deploys on push, via a branch-scoped Preview environment)
- **Database:** a dedicated Supabase project (`tailr-staging`), fully isolated from production — schema mirrors `supabase/schema.sql` + `supabase/migrations/002_rate_limits.sql`
- **Shared with production:** `ANTHROPIC_API_KEY`, `RESEND_API_KEY` (no separate accounts needed; staging tailors go through the same Claude API and can send real test emails)

## Workflow

1. Open a feature branch as usual, PR into `main` as normal for code review + CI.
2. Before merging to `main`, merge (or push) the same changes into `staging` first.
3. Click around on the staging URL to confirm things work against a real deploy with an isolated database — no risk of polluting production data.
4. Once verified, merge to `main` for the real production release.

## Keeping schema in sync

Any new Supabase migration needs to be run **twice**: once against production, once against the `tailr-staging` project's SQL Editor. There's no automatic sync — this is a manual step per migration.
