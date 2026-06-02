# CV Tailor — SaaS MVP

AI-powered resume tailoring with freemium subscriptions. Built with Next.js 14, Supabase, Stripe, and Claude.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Auth + DB | Supabase (Postgres + Auth) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Payments | Stripe Checkout + Webhooks |
| Deployment | Vercel (recommended) |

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in each value — see comments in `.env.example`.

### 3. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial.sql` via the Supabase SQL editor
3. Copy your project URL, anon key, and service role key into `.env.local`

### 4. Set up Stripe

1. Create a product + recurring price in your [Stripe dashboard](https://dashboard.stripe.com)
2. Copy the Price ID into `STRIPE_PRO_PRICE_ID`
3. For webhooks locally, run:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project structure

```
app/
  page.tsx                   # Landing page
  (auth)/
    login/page.tsx
    signup/page.tsx
  (dashboard)/
    dashboard/page.tsx       # Main tailoring interface
  pricing/page.tsx
  api/
    tailor/route.ts          # Core AI tailoring endpoint
    stripe/
      checkout/route.ts      # Start Stripe Checkout session
      webhook/route.ts       # Handle Stripe events
    billing-portal/route.ts  # Manage existing subscription

components/
  TailorForm.tsx             # CV + JD inputs, calls /api/tailor
  ResultPanel.tsx            # Tabbed result display
  UsageBar.tsx               # Free tier usage indicator
  PricingCards.tsx           # Pricing page cards

lib/
  supabase/
    client.ts                # Browser Supabase client
    server.ts                # Server Supabase + admin client
  anthropic.ts               # Anthropic client + system prompt
  stripe.ts                  # Stripe client + plan config

supabase/migrations/
  001_initial.sql            # profiles, subscriptions, usage_logs tables + RLS

middleware.ts                # Route protection (auth guard)
```

---

## Business logic

**Free tier:** 3 tailors per calendar month. Enforced server-side via `usage_logs` + `get_monthly_usage()` RPC.

**Pro tier:** Unlimited tailors, £12/month via Stripe. Subscription state synced via webhook (`customer.subscription.*` events).

**Upgrade flow:** Dashboard → `/pricing` → Stripe Checkout → webhook updates `subscriptions.plan = 'pro'` → redirect to `/dashboard?upgraded=true`.

---

## Deploy to Vercel

1. Push to GitHub
2. Import repo in Vercel
3. Add all env vars from `.env.example`
4. Set `NEXT_PUBLIC_SITE_URL` to your production URL
5. Add your production URL to Supabase Auth → URL Configuration → Redirect URLs
6. Register a Stripe webhook pointing to `https://yourdomain.com/api/stripe/webhook` for events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

---

## Customisation

- **Change the free tier limit:** Update `FREE_TIER_LIMIT` in `app/api/tailor/route.ts`
- **Change pricing:** Update `PLANS` in `lib/stripe.ts`
- **Change the AI model or prompt:** Edit `lib/anthropic.ts`
- **Add .docx export (Pro feature):** Use the `docx` skill from Cowork to add a download endpoint
