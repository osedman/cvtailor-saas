# AGENTS.md

Repo-level guidance for AI agents. The root `CLAUDE.md` holds the team's working
rules (design, verification, git, tracking) and takes precedence for those
topics — read it too.

## Cursor Cloud specific instructions

Tailr / CV Tailor is a single **Next.js 16 (App Router) + React 19** app (not a
monorepo). Auth + data live in **Supabase (Postgres)**; the AI tailoring
pipeline calls **Anthropic Claude**. Package manager is **pnpm** (Node 22),
matching CI (`.github/workflows/ci.yml`) and `vercel.json`. A stray
`package-lock.json` also exists — ignore it; use pnpm.

### Standard commands (see `package.json` scripts)
- Dev server: `pnpm dev` (Next.js + Turbopack, http://localhost:3000)
- Tests: `pnpm test` (Vitest, ~123 tests)
- Build: `pnpm build` (full compile + project-wide typecheck; this is what CI/Vercel run)

### Non-obvious caveats
- **A `.env.local` is required just to boot `pnpm dev` / `pnpm build`.** Module-level
  clients initialise eagerly with a non-null assertion (`lib/anthropic.ts` does
  `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })`, and the Supabase
  clients read `NEXT_PUBLIC_SUPABASE_URL!` etc.), and the Anthropic SDK
  constructor throws on a missing key. With no env file, pages/routes that import
  these crash. CI works around this by passing placeholder env vars to `pnpm build`.
  For local dev, create `.env.local` with at least these (placeholders are fine
  for the server to start and for parsing/UI work — real values are only needed
  for the actual AI + auth flows):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
  SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
  ANTHROPIC_API_KEY=placeholder-anthropic-key
  NEXT_PUBLIC_SITE_URL=http://localhost:3000
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
  ```
  `.env*` is gitignored, so this file is never committed. See `.env.example` for
  the full list (Stripe, Resend, Reed, Sentry are all optional and degrade
  gracefully when their keys are absent).
- **`pnpm lint` is currently broken** and is NOT part of CI. The script is
  `eslint .` but `eslint` is not a declared dependency and there is no eslint
  config in the repo, so it exits with `eslint: not found`. CI relies on
  `pnpm test` + `pnpm build` only. Do not treat a failing `pnpm lint` as a
  regression you introduced.
- **`pnpm install` shows "Ignored build scripts: @sentry/cli, sharp"** — this is
  expected and harmless for dev; CI does not approve them either. Do not run the
  interactive `pnpm approve-builds`.

### What runs without secrets vs. what needs them
- **No secrets needed:** dev server boots, all UI renders, tests/build pass, and
  the CV-ingestion endpoint `POST /api/parse-cv` works end-to-end (PDF via
  `unpdf`, DOCX via `mammoth`, TXT) — this is the first step of the tailor flow.
- **Real secrets needed for the core money path:** the AI tailoring endpoint
  (`/api/tailor`) requires a valid `ANTHROPIC_API_KEY`, and all authenticated
  flows (magic-link/OTP login, history, tracker, usage limits) require a real
  **hosted Supabase project** with the migrations in `supabase/migrations/`
  applied (migrations are run manually — see `CLAUDE.md`). Stripe billing is
  optional and only needed to test the upgrade flow.
