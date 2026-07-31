#!/usr/bin/env node
/**
 * Career path GA announcement — the beta gate is lifted, tell everyone.
 *
 * YOU run this, not an agent. The recipient list is real user emails, so it
 * never passes through a chat transcript — same rule as the win-back script.
 *
 * Usage (from the repo root):
 *   node scripts/send-career-path-ga.mjs --dry              count only, sends nothing
 *   node scripts/send-career-path-ga.mjs --list             show who would receive it
 *   node scripts/send-career-path-ga.mjs --test you@x.com   send one copy to yourself
 *   node scripts/send-career-path-ga.mjs --send             send to everyone (asks first)
 *
 * Targets: every profile with an email. This is a product announcement, not a
 * nudge — the whole point is that the feature is now on EVERY account.
 *
 * Copy source of truth: email/career-path-out-of-beta.md (the "direct" draft,
 * signed Tailr). Do not send before a non-beta account has been verified to
 * reach /career-path on production.
 *
 * Reads .env.development.local for SUPABASE + RESEND credentials. Refuses any
 * From address that is not a verified gettailr.com sender — the one thing that
 * silently broke welcome emails before.
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

const CTA_URL = 'https://app.gettailr.com/career-path'
const SUBJECT = 'Career path is on your account. Now.'

// ── env ──────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY = env.RESEND_API_KEY
const FROM = env.WELCOME_FROM || 'Tailr <hello@gettailr.com>'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.development.local')
  process.exit(1)
}
if (!/@gettailr\.com>?\s*$/.test(FROM)) {
  console.error(`Refusing to send: WELCOME_FROM is "${FROM}".`)
  console.error('Only gettailr.com is a verified sender — anything else silently fails to deliver.')
  process.exit(1)
}

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const valueOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── the email (HTML rendering of email/career-path-out-of-beta.md) ──────
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Hanken Grotesk',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>

<p style="font-size:16px;line-height:1.6;color:#595959;margin:24px 0 6px;">No preamble on this one.</p>
<h1 style="font-size:27px;line-height:1.22;font-weight:800;letter-spacing:-0.5px;margin:0 0 18px;">Career path is out of beta. It&rsquo;s on your account right now &mdash; nothing to enable, nothing to pay.</h1>

<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 18px;">Here&rsquo;s what it does:</p>

<p style="font-size:16px;line-height:1.55;margin:0 0 6px;"><strong style="color:#1e1813;">&#10142; It reads the CV you already gave us and picks your North Star role</strong></p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 16px;">The one job your experience actually points at. Not a suggestion feed &mdash; one target.</p>

<p style="font-size:16px;line-height:1.55;margin:0 0 6px;"><strong style="color:#1e1813;">&#10142; It shows the honest distance between you and it</strong></p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 16px;">What you already have, what&rsquo;s missing, and which gap to close first. Specific to you, in order.</p>

<p style="font-size:16px;line-height:1.55;margin:0 0 6px;"><strong style="color:#1e1813;">&#10142; The CV builder turns what you&rsquo;ve done into evidence</strong></p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 20px;">Not buzzwords. The real things you did, put where recruiters look. If you can&rsquo;t back it, we don&rsquo;t write it.</p>

<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 24px;">That&rsquo;s it. You&rsquo;ve been tailoring CVs one job at a time. This is the part that tells you whether they&rsquo;re the right jobs.</p>

<div style="text-align:center;margin:26px 0 26px;"><a href="${CTA_URL}" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 30px;border-radius:10px;">Open your career path &rarr;</a></div>

<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 16px;">One ask: when it proposes your North Star, reply to this email with one word &mdash; <strong style="color:#1e1813;">right</strong> or <strong style="color:#1e1813;">wrong</strong>. That&rsquo;s the whole survey.</p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 24px;">It&rsquo;s new. If it misses, tell us and we&rsquo;ll fix it.</p>
<p style="font-size:15px;color:#1e1813;margin:0;">Tailr</p>
<p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">You are receiving this because you signed up for Tailr at gettailr.com. Reply with the word UNSUBSCRIBE and we will remove you.</p>
</div></body></html>`

async function send(to) {
  if (!RESEND_KEY) return { ok: false, err: 'RESEND_API_KEY not set' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: SUBJECT, html }),
  })
  if (!res.ok) return { ok: false, err: `${res.status} ${(await res.text()).slice(0, 160)}` }
  return { ok: true }
}

// ── recipients: everyone with an email ───────────────────────────────────
async function recipients() {
  const { data: profiles, error } = await supabase
    .from('profiles').select('id, email, created_at')
  if (error) {
    if (/invalid api key/i.test(error.message ?? '')) {
      console.error('Supabase rejected the service role key.\n')
      console.error('SUPABASE_SERVICE_ROLE_KEY in .env.development.local is a placeholder,')
      console.error('not the real key. Grab it from the Supabase dashboard:')
      console.error('  Project settings → API keys → service_role → Reveal\n')
      console.error('It is a secret: it bypasses RLS. Keep it out of git and out of chat.')
      process.exit(1)
    }
    throw error
  }
  const seen = new Set()
  return (profiles ?? [])
    .filter((p) => {
      const e = (p.email ?? '').trim().toLowerCase()
      if (!e || seen.has(e)) return false
      seen.add(e)
      return true
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

// ── run ──────────────────────────────────────────────────────────────────
const people = await recipients()

if (has('--test')) {
  const to = valueOf('--test')
  if (!to) { console.error('Usage: --test you@example.com'); process.exit(1) }
  const r = await send(to)
  console.log(r.ok ? `Test sent to ${to}` : `FAILED: ${r.err}`)
  process.exit(r.ok ? 0 : 1)
}

if (has('--list')) {
  console.log(`${people.length} users would receive the GA announcement:\n`)
  for (const p of people) {
    const days = Math.floor((Date.now() - Date.parse(p.created_at)) / 86400000)
    console.log(`  ${p.email.padEnd(38)} signed up ${days}d ago`)
  }
  process.exit(0)
}

if (has('--dry') || !has('--send')) {
  console.log(`${people.length} would receive "${SUBJECT}" from ${FROM}.`)
  console.log('Nothing sent. Use --list to see who, --test <email> to preview, --send to go.')
  process.exit(0)
}

// --send: confirm out loud before touching real users.
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question(`Send to ${people.length} real users? Type SEND to confirm: `)
rl.close()
if (answer.trim() !== 'SEND') { console.log('Cancelled.'); process.exit(0) }

let sent = 0, failed = 0
for (const p of people) {
  const r = await send(p.email)
  if (r.ok) { sent++; console.log(`  sent  ${p.email}`) }
  else { failed++; console.log(`  FAIL  ${p.email} — ${r.err}`) }
  await new Promise((r) => setTimeout(r, 600)) // stay under Resend's rate limit
}
console.log(`\nDone. ${sent} sent, ${failed} failed.`)
