#!/usr/bin/env node
/**
 * Send a Tailr email digest via Resend.
 *
 *   node scripts/send-digest.mjs <email.html> --test you@example.com
 *   node scripts/send-digest.mjs <email.html> --list          # sends to all subscribed
 *   node scripts/send-digest.mjs <email.html> --list --dry     # count only, sends nothing
 *
 * Subject: first "Subject (Primary):" line in the HTML comment header, or --subject "...".
 * Reads RESEND_API_KEY, WELCOME_FROM, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * via scripts/lib/mail-env.mjs (shell env, then .env.local, then
 * .env.development.local). Refuses to send unless WELCOME_FROM is a
 * gettailr.com sender AND that domain is verified on the Resend account.
 *
 * The subscriber list is screened before sending: test-probe domains, owner plus-aliases,
 * syntactically invalid addresses, known typo domains, and duplicates are dropped and
 * printed with a reason. Always run --list --dry first and read the exclusions.
 */
import fs from "node:fs";
import { requireMailEnv, assertVerifiedSender } from "./lib/mail-env.mjs";

const {
  RESEND_API_KEY,
  FROM: WELCOME_FROM,
  SUPABASE_URL: NEXT_PUBLIC_SUPABASE_URL,
  SERVICE_KEY: SUPABASE_SERVICE_ROLE_KEY,
} = requireMailEnv();

const args = process.argv.slice(2);
const htmlFile = args.find((a) => !a.startsWith("--"));
const testIdx = args.indexOf("--test");
const testTo = testIdx >= 0 ? args[testIdx + 1] : null;
const listMode = args.includes("--list");
const dry = args.includes("--dry");
const subjIdx = args.indexOf("--subject");
const subjectArg = subjIdx >= 0 ? args[subjIdx + 1] : null;

if (!htmlFile) { console.error("Give an HTML file path."); process.exit(1); }

const html = fs.readFileSync(htmlFile, "utf8");
const subject = subjectArg
  // Drafts put the subject inside an HTML comment. When "-->" closes on the
  // same line it lands in the capture group, so strip it before trimming.
  || (html.match(/Subject \(Primary\):\s*(.+)/) || [])[1]?.replace(/-->.*$/, "").trim()
  || "Tailr weekly digest";

async function send(to) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: WELCOME_FROM, to: [to], subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function subscribers() {
  const url = `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/mailing_list?select=email&subscribed=eq.true&order=created_at`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return (await res.json()).map((r) => r.email).filter(Boolean);
}

// subscribed=true is not enough on its own: the table carries test probes, Ose's own
// plus-aliases, and addresses that will hard bounce. Screen them out before sending.
const TEST_DOMAINS = new Set(["example.com", "test.com", "ocuser.com", "example.org"]);
const TYPO_DOMAINS = new Set(["icoud.com", "iclod.com", "gmial.com", "gmai.com", "gmail.co", "hotmial.com", "hotmial.co.uk", "outlok.com", "yaho.com"]);
const OWNER = new Set(["o.oifoh@gmail.com", "ose@lean-frame.com"]);

const isOwnerAlias = (e) => /^(o\.oifoh|ose)\+/.test(e);
const looksValid = (e) =>
  /^[^\s@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(e) &&
  !/\.\./.test(e) &&
  !/^\./.test(e) &&
  !/\.@/.test(e);

function screen(emails) {
  const kept = [];
  const dropped = [];
  const seen = new Set();
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    const domain = e.split("@")[1] || "";
    let reason = null;
    if (seen.has(e)) reason = "duplicate";
    else if (!looksValid(e)) reason = "invalid address";
    else if (TEST_DOMAINS.has(domain)) reason = "test domain";
    else if (TYPO_DOMAINS.has(domain)) reason = "typo domain, will bounce";
    else if (OWNER.has(e) || isOwnerAlias(e)) reason = "owner or alias";
    seen.add(e);
    if (reason) dropped.push({ email: raw, reason });
    else kept.push(e);
  }
  return { kept, dropped };
}

(async () => {
  console.log(`From:    ${WELCOME_FROM}`);
  console.log(`Subject: ${subject}`);
  await assertVerifiedSender(WELCOME_FROM, RESEND_API_KEY);

  if (testTo) {
    const id = await send(testTo);
    console.log(`TEST sent to ${testTo} — Resend id ${id}`);
    return;
  }

  if (listMode) {
    const raw = await subscribers();
    const { kept: list, dropped } = screen(raw);
    console.log(`Subscribed rows:  ${raw.length}`);
    console.log(`After screening:  ${list.length}`);
    if (dropped.length) {
      console.log(`Excluded (${dropped.length}):`);
      for (const d of dropped) console.log(`  ${d.email}  [${d.reason}]`);
    }
    if (!list.length) { console.error("No recipients left after screening. Aborting."); process.exit(1); }
    if (dry) { console.log("\nDRY RUN — nothing sent. First few:", list.slice(0, 3)); return; }
    let ok = 0, fail = 0;
    for (const email of list) {
      try { await send(email); ok++; }
      catch (e) { fail++; console.error(`  FAIL ${email}: ${e.message}`); }
      await sleep(550); // stay under Resend rate limits
    }
    console.log(`Done. Sent ${ok}, failed ${fail}, of ${list.length}.`);
    return;
  }

  console.error("Nothing to do. Use --test <email> or --list.");
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
