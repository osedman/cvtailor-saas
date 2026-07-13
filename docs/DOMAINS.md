# Domain split: www (marketing) + app (product)

**Target**

| Host | Serves | Who edits |
|------|--------|-----------|
| `www.gettailr.com` | Marketing landing | Marketing (Framer / Webflow / similar) |
| `app.gettailr.com` | Tailr product (this Next.js app) | Engineering |
| `gettailr.com` (apex) | Redirects only | DNS |

Code support lives in `lib/site-url.ts` and `proxy.ts`. Apex redirects stay **off** until you set `DOMAIN_SPLIT_ENABLED=true` in Vercel — so production keeps working on apex until DNS is ready.

---

## Checklist (do in order)

### 1. Marketing site on www

1. Create a Framer or Webflow project for the Tailr landing page.
2. Brand CTAs must point at **`https://app.gettailr.com/tailor`** (Sign in / Tailor my CV).
3. In Framer/Webflow, add custom domain **`www.gettailr.com`** and follow their DNS instructions (usually a CNAME to their host).

### 2. Product on app (Vercel)

In the existing Vercel project (`cvtailor-saas`):

1. **Settings → Domains** → add **`app.gettailr.com`**.
2. At your DNS registrar for `gettailr.com`, add the record Vercel shows (typically `CNAME app → cname.vercel-dns.com`).
3. Wait until Vercel shows the domain as **Valid**.

### 3. Apex redirects

Once both `www` and `app` resolve:

1. In Vercel, keep **`gettailr.com`** on this project (or point it at Vercel) so middleware can redirect.
2. Set Production env vars:

```
NEXT_PUBLIC_APP_URL=https://app.gettailr.com
NEXT_PUBLIC_MARKETING_URL=https://www.gettailr.com
NEXT_PUBLIC_SITE_URL=https://app.gettailr.com
DOMAIN_SPLIT_ENABLED=true
```

3. Redeploy production after saving env vars.

With `DOMAIN_SPLIT_ENABLED=true`:

- `gettailr.com/` → `www.gettailr.com`
- `gettailr.com/tailor` (and other app paths) → `app.gettailr.com/...`
- `app.gettailr.com/` → `www.gettailr.com`

### 4. Supabase Auth

In **both** production and staging Supabase projects → Authentication → URL configuration:

**Site URL:** `https://app.gettailr.com`

**Redirect URLs** (add, don’t remove apex until cutover is verified):

- `https://app.gettailr.com/auth/confirm`
- `https://app.gettailr.com/auth/callback`
- `https://gettailr.com/auth/confirm` (keep briefly for in-flight magic links)
- `https://gettailr.com/auth/callback`

Magic-link emails use `emailRedirectTo` → `/auth/confirm` on the product origin (`NEXT_PUBLIC_APP_URL`). Failed verifies redirect to `/tailor?error=…` (where the toast lives) — never to `/`, which the domain proxy would strip into a silent www homepage.

### 5. Smoke test

- [ ] `https://www.gettailr.com` loads marketing; CTA opens `app.gettailr.com/tailor`
- [ ] Magic link sign-in works on `app.gettailr.com`
- [ ] `https://gettailr.com/tailor` redirects to `app.gettailr.com/tailor`
- [ ] `https://gettailr.com/` redirects to `www.gettailr.com`
- [ ] Welcome email CTA hits `app.gettailr.com/tailor` (after env vars set)

### 6. Optional cleanup later

- Remove the in-repo marketing page from being the public face (it remains as a fallback on non-app hosts / local).
- Drop apex from Supabase redirect allow-list once old links have expired.
- Update Word footer / any remaining hard-coded `gettailr.com` strings if you want brand consistency.

---

## What engineering already shipped in the repo

- `lib/site-url.ts` — `getAppOrigin()`, `getMarketingOrigin()`, `appPath()`
- `proxy.ts` — host-aware redirects (apex gated on `DOMAIN_SPLIT_ENABLED`; Next.js 16 uses `proxy` instead of `middleware`)
- Welcome email CTA uses `appPath('/tailor')`
- `.env.example` documents the new vars

DNS and Framer/Webflow accounts cannot be created from this repo — those steps are yours (or marketing’s) in the registrar + host UIs.
