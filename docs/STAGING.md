# Staging environment

Tailr has a persistent staging environment for testing changes before they reach production.

## URLs / infra

- **Staging URL:** https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app
- **Vercel branch:** `staging` (auto-deploys on push, via a branch-scoped Preview environment)
- **Database:** a dedicated Supabase project (`tailr-staging`), fully isolated from production — schema mirrors `supabase/schema.sql` + migrations under `supabase/migrations/`
- **Shared with production:** `ANTHROPIC_API_KEY`, `RESEND_API_KEY` (no separate accounts needed; staging tailors go through the same Claude API and can send real test emails)

## "I don't have access to staging" — diagnose before assuming Deployment Protection

Two very different failures both get reported as "I can't get into staging". Tell them apart
in one command before touching any Vercel settings:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app/tailor
```

- **403** → Vercel Deployment Protection. Use the Hobby workarounds below.
- **200, but the sign-in modal says `Invalid API key`** → **not an access problem at all**.
  Staging's Supabase env vars are pointing at the wrong project. See the next section.

### Wrong-project Supabase keys (hit 30 Jul 2026)

Symptom: staging loads fine for anyone, but signing in fails with `Invalid API key`.
Cause: staging's `NEXT_PUBLIC_SUPABASE_URL` correctly pointed at `tailr-staging`
(`pwonuqkpumgejqmotkwh`) while **both** Supabase keys still held **production's** values
(`wgpaaafseibcqagiiavt`). Supabase rejects a key that belongs to another project.

This happened because production was migrated from the legacy JWT `anon` key to the new
`sb_publishable_…` format, and the new value was written at a scope that also covered the
`staging` branch's Preview environment.

Check what staging actually resolves to — never trust the dashboard listing alone:

```bash
npx vercel@latest env pull /tmp/staging.env --environment=preview --git-branch=staging
```

The URL ref and the key's project **must match**. Both keys matter and they fail differently:

| Variable | Used by | Symptom when it's the wrong project |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser client | client auth calls 401 `Invalid API key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `POST /api/auth/request-otp` | route returns 400 `{"error":"Invalid API key"}` — **no login email is ever sent** |

Verify the anon key without sending anything, and the service-role key end to end:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pwonuqkpumgejqmotkwh.supabase.co/auth/v1/settings -H "apikey: <staging anon key>"
```

```bash
curl -s -X POST https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app/api/auth/request-otp -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Keys are inlined at build time, so **always redeploy after changing one** — a refresh will
not pick it up:

```bash
npx vercel@latest redeploy cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app
```

> **Do not use `vercel env rm <name> preview staging` to fix this.** It is broader than it
> looks: it removed the branch-scoped entry *and* stripped the `Preview` + `Development`
> targets off the shared variable, leaving every PR preview with no key at all. Edit the
> variable in the Vercel dashboard instead. Branch-scoped `Preview (staging)` correctly takes
> precedence over a general `Preview` entry, so the two are meant to coexist.

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

Magic links must stay on the staging host (not production). The app sends OTPs via
`POST /api/auth/request-otp` (Resend + `admin.generateLink`) so delivery does **not**
depend on Supabase Auth SMTP. That bypasses a recurring staging failure where Resend
rejects Supabase's mailer with `550` when the Auth SMTP From is still
`onboarding@resend.dev` (test mode only delivers to the Resend account owner).

Still keep Auth URL config correct for `/auth/confirm` redirects:

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
