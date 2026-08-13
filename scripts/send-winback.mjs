#!/usr/bin/env node
/**
 * Win-back email for users who signed up but never tailored a CV.
 *
 * YOU run this, not an agent. The recipient list is real user emails, so it
 * never passes through a chat transcript — same rule as the digest script.
 *
 * Usage (from the repo root):
 *   node scripts/send-winback.mjs --dry              count only, sends nothing
 *   node scripts/send-winback.mjs --list             show who would receive it
 *   node scripts/send-winback.mjs --test you@x.com   send one copy to yourself
 *   node scripts/send-winback.mjs --send             send to everyone (asks first)
 *
 * Targets: profiles with tailors_used = 0 AND no rows in tailor_history.
 * Both conditions, because the counter and the history table can disagree.
 *
 * Reads SUPABASE + RESEND credentials via scripts/lib/mail-env.mjs (shell env,
 * then .env.local, then .env.development.local). Refuses any From address that
 * is not a gettailr.com sender verified on the Resend account — the one thing
 * that silently broke welcome emails before.
 */
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'
import { requireMailEnv, assertVerifiedSender } from './lib/mail-env.mjs'

const WALKTHROUGH = 'https://www.gettailr.com/walkthrough'
const HERO = 'https://www.gettailr.com/email/match-preview.png'
const SUBJECT = 'Seven seconds is all your CV gets'

// ── env ──────────────────────────────────────────────────────────────────
const {
  SUPABASE_URL,
  SERVICE_KEY,
  RESEND_API_KEY: RESEND_KEY,
  FROM,
} = requireMailEnv()

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const valueOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── the email ────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Hanken Grotesk',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>

<h1 style="font-size:27px;line-height:1.22;font-weight:800;letter-spacing:-0.5px;margin:24px 0 10px;">Seven seconds is all your CV gets</h1>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 20px;">That is roughly how long a recruiter spends before deciding, according to Ladders' eye tracking research. In seven seconds nobody finds the line that proves you can do the job. Tailr moves it to where they are already looking.</p>

<img src="${HERO}" alt="A Tailr match score of 82 percent, with each requirement traced to the line in the CV that evidences it, and one honest gap." width="520" style="width:100%;max-width:520px;height:auto;display:block;border:0;border-radius:14px;margin:0 0 10px;" />
<p style="font-size:13px;line-height:1.5;color:#8a8178;margin:0 0 24px;">A real run. Every requirement mapped to the evidence behind it, and the one gap named rather than papered over.</p>

<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 20px;">You signed up but have not tailored a CV yet. It takes about 30 seconds: paste the job, add your CV once, and get the version written for that role, with a score you can argue with.</p>

<div style="text-align:center;margin:26px 0 14px;"><a href="https://app.gettailr.com/tailor" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 30px;border-radius:10px;">Tailor your first CV &rarr;</a></div>
<p style="text-align:center;margin:0 0 26px;"><a href="${WALKTHROUGH}" style="color:#dc4f33;text-decoration:none;font-size:14px;font-weight:600;">See how it works first &rarr;</a></p>

<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 20px;">Nothing gets invented, by the way. Tailr reframes what you have actually done, and where the evidence is not there it says so, rather than writing a claim you would have to defend in the interview.</p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 24px;">Free while we are in beta. If something stopped you last time, reply and tell us what it was. We read every one.</p>
<p style="font-size:15px;color:#1e1813;margin:0;">&mdash; The Tailr team</p>
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

// ── recipients ───────────────────────────────────────────────────────────
async function recipients() {
  const { data: profiles, error } = await supabase
    .from('profiles').select('id, email, tailors_used, created_at')
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
  const { data: runs } = await supabase.from('tailor_history').select('user_id')
  const tailored = new Set((runs ?? []).map((r) => r.user_id))

  return (profiles ?? [])
    .filter((p) => (p.tailors_used ?? 0) === 0 && !tailored.has(p.id) && p.email)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

// ── run ──────────────────────────────────────────────────────────────────
const people = await recipients()

if (has('--test')) {
  const to = valueOf('--test')
  if (!to) { console.error('Usage: --test you@example.com'); process.exit(1) }
  await assertVerifiedSender(FROM, RESEND_KEY)
  const r = await send(to)
  console.log(r.ok ? `Test sent to ${to}` : `FAILED: ${r.err}`)
  process.exit(r.ok ? 0 : 1)
}

if (has('--list')) {
  console.log(`${people.length} never-tailored users:\n`)
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
await assertVerifiedSender(FROM, RESEND_KEY)
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
