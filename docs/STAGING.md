# Staging environment

Tailr has a persistent staging environment for testing changes before they reach production.

## URLs / infra

- **Staging URL:** https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app
- **Vercel branch:** `staging` (auto-deploys on push, via a branch-scoped Preview environment)
- **Database:** a dedicated Supabase project (`tailr-staging`), fully isolated from production — schema mirrors `supabase/schema.sql` + migrations under `supabase/migrations/`
- **Shared with production:** `ANTHROPIC_API_KEY`, `RESEND_API_KEY` (no separate accounts needed; staging tailors go through the same Claude API and can send real test emails)

## Who can open staging (Vercel Deployment Protection)

Preview URLs return **403** when Vercel Authentication is on. Team Viewer seats / shareable links need **Pro** — use a Hobby workaround below.

### Option A (easiest): disable Vercel Authentication

Staging already requires Tailr magic-link sign-in against `tailr-staging`, so turning off the Vercel wall is usually fine.

1. Vercel → project **cvtailor-saas** → **Settings** → **Deployment Protection**
2. Set **Vercel Authentication** to **Disabled** (or only protect Production if that option appears)
3. Send Oje the normal staging URL — no Vercel account needed

### Option B: keep protection + share a bypass URL (Hobby)

1. Same page → **Protection Bypass for Automation** → generate/copy the secret
2. Send this once (sets a cookie so later visits work):

`https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app/tailor?x-vercel-protection-bypass=SECRET&x-vercel-set-bypass-cookie=true`

Do **not** commit the secret to git. Rotate it in Vercel if it leaks.

### Option C (Pro only): invite as Viewer / Shareable Link

Skip unless you upgrade.

## Staging login (Supabase `tailr-staging`)

Magic links must stay on the staging host (not production). The app already uses `window.location.origin` for `emailRedirectTo`.

In the **tailr-staging** Supabase project → Authentication → URL configuration:

| Setting | Value |
|--------|--------|
| **Site URL** | `https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app` |
| **Redirect URLs** | `https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app/auth/confirm` |
| | `https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app/auth/callback` |
| | `https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app/**` |

**Magic Link email template** (same as prod — required so mobile prefetch does not burn the link):

```html
<h2>Sign in to Tailr (staging)</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Tailr</a></p>
<p>Or enter this code in the app: <strong>{{ .Token }}</strong></p>
```

Do **not** use `{{ .ConfirmationURL }}`.

`/auth/confirm` shows **Continue to Tailr** (verify on click). The sign-in modal also accepts the **6-digit code**.

## Workflow

1. Open a feature branch as usual, PR into `main` as normal for code review + CI.
2. Before merging to `main`, merge (or push) the same changes into `staging` first.
3. Click around on the staging URL to confirm things work against a real deploy with an isolated database — no risk of polluting production data.
4. Once verified, merge to `main` for the real production release.

## Keeping schema in sync

Any new Supabase migration needs to be run **twice**: once against production, once against the `tailr-staging` project's SQL Editor. There's no automatic sync — this is a manual step per migration.
