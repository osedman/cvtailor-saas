# Domain split: www (marketing) + app (consumer) + a separate B2B domain

**Target**

| Host | Serves | Who edits |
|------|--------|-----------|
| `www.gettailr.com` | Marketing landing | Marketing (Framer / Webflow / similar) |
| `app.gettailr.com` | Tailr product, CONSUMER side + the token doorways | Engineering |
| **a separate domain (TBC)** | Tailr for Agencies + hiring managers | Engineering |
| `gettailr.com` (apex) | Redirects only | DNS |

The B2B host is deliberately **not** a `gettailr.com` subdomain — see "The B2B
domain" below. `agencies.gettailr.com` appears in `lib/site-url.ts` as the
fallback default only, so the product has a working host before the real one is
bought; it is not the plan.

> **DECIDED (22 Aug 2026): Tailr for Agencies gets its own separate domain**,
> not a `gettailr.com` subdomain, and does not go into consumer production at
> all. Staging is the home for the B2B product until that domain exists.
>
> The subdomain steps below are kept because marketing + app still split that
> way. For the B2B host, follow **"The B2B domain"** section instead — and note
> that `agencies.gettailr.com` throughout this file is only the *default* in
> `lib/site-url.ts`, not a commitment.

All three are served by **one** Vercel deployment and one env-var set. Code
support lives in `lib/site-url.ts` and `proxy.ts`, and is already written and
tested (`lib/__tests__/proxy-routing.test.ts` covers the business host in both
directions, with the split on and off). Redirects stay **off** until
`DOMAIN_SPLIT_ENABLED=true` is set in Vercel, so production keeps working on
apex until DNS is ready.

**`DOMAIN_SPLIT_ENABLED` is one flag for all three hosts.** Flipping it cuts
marketing, app and agencies over together — there is no way to stage the
agencies host separately. Have all three DNS records valid before you set it.

**Which surface owns the doorways.** `/portal`, `/rights`, `/consent` and
`/reference` are candidate- and referee-facing and belong to the **app** host,
never the agencies one: somebody exercising a data right, or a referee
declining to comment, should not be sent to a domain branded for the agency
they are answering. The proxy enforces this — a doorway reached on the
agencies host is moved to app.

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

### 2b. Agencies host (Vercel)

Same project, second subdomain — Tailr for Agencies is not a separate
deployment.

1. **Settings → Domains** → add **`agencies.gettailr.com`**.
2. At the registrar, add the record Vercel shows (typically
   `CNAME agencies → cname.vercel-dns.com`).
3. Wait for Vercel to show **Valid**.

Nothing about the B2B product is hardcoded to a host: `getBusinessOrigin()`
reads `NEXT_PUBLIC_BUSINESS_URL` and falls back to `agencies.gettailr.com`, so
moving it to a bought domain later is a config + DNS change, not a code change.
(Doing that WOULD need two other things solved first — see "If you ever leave
the subdomain" at the bottom.)

### 3. Apex redirects

Once both `www` and `app` resolve:

1. In Vercel, keep **`gettailr.com`** on this project (or point it at Vercel) so middleware can redirect.
2. Set Production env vars:

```
NEXT_PUBLIC_APP_URL=https://app.gettailr.com
NEXT_PUBLIC_MARKETING_URL=https://www.gettailr.com
NEXT_PUBLIC_BUSINESS_URL=https://agencies.gettailr.com
NEXT_PUBLIC_SITE_URL=https://app.gettailr.com
DOMAIN_SPLIT_ENABLED=true
```

**Tick Production on every one of these.** A variable set while working on
staging is Preview-scoped and production will not see it — that cost three
rounds of "still not working" on 28 Jul 2026. `NEXT_PUBLIC_*` values are baked
in at build time, so a redeploy is required after saving, not just a restart.

3. Redeploy production after saving env vars.

With `DOMAIN_SPLIT_ENABLED=true`:

- `gettailr.com/` → `www.gettailr.com`
- `gettailr.com/tailor` (and other app paths) → `app.gettailr.com/...`
- `app.gettailr.com/` → `www.gettailr.com`
- `gettailr.com/agencies`, `/hiring` (and `www`/`app` too) → `agencies.gettailr.com/...`
- `agencies.gettailr.com/` → `agencies.gettailr.com/agencies` (the recruiter
  product is that host's front page, not marketing)
- `agencies.gettailr.com/tailor` → `app.gettailr.com/tailor` (a consumer path
  reached on the business host)

`/auth` and `/api` are **host-neutral** and never redirected. Auth must finish
on the host it started on or the session it just minted is dropped; redirecting
an API call cross-origin turns a working same-origin POST into a CORS failure.

### 4. Supabase Auth

In **both** production and staging Supabase projects → Authentication → URL configuration:

**Site URL:** `https://app.gettailr.com`

**Redirect URLs** (add, don’t remove apex until cutover is verified):

- `https://app.gettailr.com/auth/confirm`
- `https://app.gettailr.com/auth/callback`
- `https://agencies.gettailr.com/auth/confirm`  ← **required, or recruiter sign-in fails**
- `https://agencies.gettailr.com/auth/callback`
- `https://gettailr.com/auth/confirm` (keep briefly for in-flight magic links)
- `https://gettailr.com/auth/callback`

The agencies entries are not optional. `/auth` is host-neutral precisely so a
recruiter signing in at `agencies.gettailr.com` completes there and keeps the
session; if that host is missing from the allow-list, Supabase refuses the
redirect and B2B sign-in is broken while the consumer side looks fine.

Magic-link emails are **minted and sent by Tailr, not by Supabase.**
`app/api/auth/request-otp/route.ts` calls `admin.auth.admin.generateLink()` to
get a `hashed_token`, builds the confirm URL itself, and sends it through
Resend. The origin it uses is chosen **per door** — `getBusinessOrigin()` for a
business host, `getAppOrigin()` otherwise — so each side's sign-in returns to
its own domain with no template involved.

That matters for the notes below: Supabase's own Magic Link template and its
single `{{ .SiteURL }}` are **not in this path**, so they are not a constraint
on having two domains. What Supabase still enforces is the **redirect
allow-list** — `generateLink`'s `redirectTo` must be on it, or sign-in fails. `/auth/confirm` is a **click-to-continue** page (does not verify on GET) so mobile email prefetchers cannot burn the one-time token. Failed verifies redirect to `/tailor?error=…` (where the toast lives) — never to `/`, which the domain proxy would strip into a silent www homepage.

**Magic Link email template** (Auth → Email Templates → Magic Link) — required for mobile:

```html
<h2>Sign in to Tailr</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Tailr</a></p>
<p>Or enter this code in the app: <strong>{{ .Token }}</strong></p>
```

Do **not** use `{{ .ConfirmationURL }}` — that hits Supabase’s verify endpoint on the first GET (email scanners / iOS Mail / Outlook Safe Links), which is what breaks mobile login.

**Session cookies** use `Domain=.gettailr.com` in production (`VERCEL_ENV=production`) so a sign-in on `app` stays valid if the user later hits apex/www — and, because `agencies.gettailr.com` is under the same registrable domain, on the agencies host too. One sign-in therefore covers both sides. Override with `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` if needed.

That shared cookie is a property of staying on a **subdomain**. It is also the
reason the two sides still separate properly at the product level rather than
the cookie level: `doorFromHost()` decides which front door someone came
through from the Host header — never a query parameter, which would be a claim
the visitor makes about themselves — and it grants nothing. Every hat is
re-checked against the database.

**Supabase dashboard (Auth → Sessions):** keep refresh sessions enabled; prefer a long inactivity timeout (or none) so users are not forced back through magic link every few days. JWT (access token) expiry can stay short — the proxy refreshes it.

### 5. Smoke test

- [ ] `https://www.gettailr.com` loads marketing; CTA opens `app.gettailr.com/tailor`
- [ ] Magic link sign-in works on `app.gettailr.com`
- [ ] `https://gettailr.com/tailor` redirects to `app.gettailr.com/tailor`
- [ ] `https://gettailr.com/` redirects to `www.gettailr.com`
- [ ] Welcome email CTA hits `app.gettailr.com/tailor` (after env vars set)
- [ ] `https://agencies.gettailr.com/` lands on the recruiter product
- [ ] Magic-link sign-in works **on `agencies.gettailr.com`** and lands in the agency workspace
- [ ] `https://gettailr.com/agencies` redirects to `agencies.gettailr.com/agencies`
- [ ] `https://agencies.gettailr.com/tailor` redirects to `app.gettailr.com/tailor`
- [ ] A candidate doorway (`/rights/<token>`) opens on **app**, not agencies
- [ ] One sign-in works across app and agencies without a second magic link

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

---

## The B2B domain (separate, not a subdomain)

**Decided 22 Aug 2026.** A distinct domain is the honest answer to the
objection an agency actually raises — that their candidate data sits with a
vendor who also runs a candidate platform. A subdomain does not answer it.

**Almost none of this is a code change.** Two things were built in August that
happen to make it cheap, both on purpose:

1. **`getBusinessOrigin()` reads `NEXT_PUBLIC_BUSINESS_URL`** with no hardcoded
   host constant, and `getBusinessHost()` derives from it. Every business rule
   in `proxy.ts` and every business check in `cookie-options.ts` keys off that
   derived host, so they work for any domain, not just a `gettailr.com` child.
2. **Business hosts never get the shared cookie.** `authCookieOptions()`
   returns host-only for any business host, checked *before* the
   `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` override, precisely so the two products can
   never share a login through a DNS coincidence. Two sessions above one auth
   pool was the design from 14 Aug — a separate domain does not change it, it
   just makes the reason obvious.

So a person with both hats signs in to each side once. That was already true on
the subdomain; it stays true here.

### Timing: build now, buy later

**The domain is deliberately deferred** (22 Aug 2026). The B2B build continues
on staging under the current setup, and the domain is bought when production is
actually wanted. This is safe because nothing in the product knows its own
host: every B2B link — client invites, team sign-in, notification CTAs, the
auth callback, the OTP redirect — is built from `getBusinessOrigin()`, which
reads `NEXT_PUBLIC_BUSINESS_URL`.

`lib/__tests__/business-origin-guardrail.test.ts` keeps it that way. It scans
`lib/agency`, `app/agencies`, `app/hiring` and both API trees and fails on any
hardcoded `https://host` in a link. That matters more than it sounds: a
hardcoded origin still works on staging, still passes review, and points at the
wrong domain the day the real one goes live. Sender addresses are exempt and
are their own task below.

**One thing that is NOT just config at domain time: email.** `notices.ts` sends
as `notices@gettailr.com` and the mailer defaults to `hello@gettailr.com`,
because gettailr.com is the only verified Resend sender. An agency-branded
product emailing hiring managers from the consumer brand's domain partly undoes
the separation the domain was bought for, so verifying the new domain in Resend
and moving the B2B senders belongs in the same piece of work.

### Checklist

1. **Buy the domain.** Nothing in the repo cares what it is.
2. **Vercel → Settings → Domains** → add it to this project. Same deployment,
   one env-var set — a second deployment is not needed and would double the
   surface for no gain. (If a separate deployment is ever wanted for isolation,
   that is a bigger decision: see the note below.)
3. **DNS** at the new domain's registrar: the record Vercel shows. Wait for
   **Valid**.
4. **Vercel env (Production, ticked explicitly):**
   `NEXT_PUBLIC_BUSINESS_URL=https://<the new domain>`
   Redeploy — `NEXT_PUBLIC_*` is baked in at build time.
5. **Resend → verify the new domain**, then point the B2B senders at it
   (`lib/email.ts` default `from`, and `notices.ts`). Until this is done the
   agency product emails from the consumer brand.
6. **Supabase → Authentication → URL configuration → Redirect URLs**, add:
   - `https://<the new domain>/auth/confirm`
   - `https://<the new domain>/auth/callback`

   Required. `generateLink`'s `redirectTo` is checked against this list, so
   without it B2B sign-in fails while the consumer side looks fine.
7. **Do NOT set `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`** to anything spanning both.
   It cannot span two registrable domains anyway, and `authCookieOptions()`
   ignores it for business hosts by design.

### Smoke test

- [ ] `https://<new domain>/` lands on the recruiter product
- [ ] Sign-in on the new domain emails a link **pointing at the new domain**
- [ ] That link completes and lands in the agency workspace
- [ ] Signing in on the B2B domain does **not** sign you in on the consumer app,
      and vice versa — two hats, two sessions, on purpose
- [ ] A candidate doorway (`/rights/<token>`) still opens on the **app** host,
      never the B2B one

### Still shared, and worth stating to an agency

One Supabase project, so agency data and consumer data sit in the same database
behind schema separation and RLS. A separate domain answers the *branding* half
of the objection, not the *data residency* half. If an agency's diligence asks
the harder question, the answer is a second Supabase project — a much larger
piece of work, and one to price rather than promise.
