#!/usr/bin/env node
/**
 * Keep a staging role walkable.
 *
 *   node scripts/seed-walkthrough.mjs windows ROL-2411 [--days 2,3,4] [--dry]
 *   node scripts/seed-walkthrough.mjs clone   ROL-2411 [--title "..."] [--dry]
 *   node scripts/seed-walkthrough.mjs state   ROL-2411
 *
 * WHY THIS EXISTS. Fixtures age. Interview windows were seeded on 14 Sep for a
 * walk-through, the walk slipped, and by 15 Sep every window was either in the
 * past or inside the 24-hour minimum notice — so the candidate doorway offered
 * nothing and (until it was fixed that day) explained it wrongly. That was the
 * second time seeded times had rotted out from under a walk. Anything written
 * as an absolute timestamp will do it again, so `windows` computes everything
 * relative to now and is safe to re-run any time.
 *
 * SAFETY, because this writes to a real database:
 *
 *  - STAGING ONLY, by allow-list: it runs against a named staging project and
 *    refuses everything else, so an unknown project is denied by default
 *    rather than permitted by default.
 *  - `--dry` prints exactly what it would write and writes nothing. Run it
 *    first; every example above is safe to prefix with it.
 *  - Every row it creates is stamped SEEDED FIXTURE in an audit row with a
 *    NULL actor. Attributing seeded data to a person is a lie in a trail that
 *    exists to say who did what.
 *  - `windows` is idempotent: it skips any window that already exists at that
 *    start for that contact, because availability_slots carries a partial
 *    unique index on (contact_id, starts_at) where revoked_at is null.
 *  - It never deletes. `clone` makes a new role; it does not reset an old one.
 *
 * WHAT IT DOES NOT DO. It does not create rounds, send invitations, or answer
 * for a candidate. The point of a walk-through is that a person performs those
 * acts; seeding them would be seeding the thing under test.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const argvRaw = process.argv.slice(2);

/**
 * This tool resolves its own env, and deliberately does NOT read
 * `.env.mail.local`.
 *
 * `scripts/lib/mail-env.mjs` reads that file FIRST and says why in its own
 * docstring: it is "for the mailers only ... so production credentials can
 * live there for a send without repointing the local dev server". On this
 * machine it holds the PRODUCTION project's service-role key.
 *
 * The first draft of this script imported loadMailEnv for convenience and
 * therefore resolved, silently, to production — a fixture-seeding tool aimed
 * at the live consumer database. The allow-list below caught it, which is the
 * only reason this comment is being written rather than a post-mortem.
 *
 * So: shell env wins, then the ordinary local files, and the mailers' file is
 * not in the list at all.
 */
function loadEnv(rootDir = process.cwd()) {
  const merged = {};
  for (const name of [".env.development.local", ".env.local"]) {
    let text;
    try {
      text = fs.readFileSync(path.join(rootDir, name), "utf8");
    } catch {
      continue; // a missing env file is normal
    }
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const withoutExport = t.replace(/^export\s+/, "");
      const i = withoutExport.indexOf("=");
      if (i <= 0) continue;
      const key = withoutExport.slice(0, i).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      merged[key] = withoutExport.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && v !== "") merged[k] = v;
  }
  return merged;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(1);
}

/* ALLOW-LIST, not a deny-list.
 *
 * The first draft of this refused a hardcoded production project ref — a ref
 * that was guessed rather than looked up, which is the worst possible thing
 * to put in a safety guard: it reads as protection and protects nothing.
 * Naming the project this IS for cannot fail that way, because a new or
 * renamed project is refused by default rather than permitted by default.
 *
 * --i-know is the deliberate escape hatch for a new staging project, and it
 * has to be typed. */
const KNOWN_STAGING = ["pwonuqkpumgejqmotkwh"]; // tailr-staging
const projectRef = (URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] ?? "";
if (!KNOWN_STAGING.includes(projectRef) && !argvRaw.includes("--i-know")) {
  console.error(
    `Refusing: ${projectRef || "that project"} is not a known staging project.\n` +
      `This tool writes fixture data and must never touch production.\n` +
      `If it really is a staging project, re-run with --i-know.`
  );
  process.exit(1);
}

const db = createClient(URL, KEY, {
  auth: { persistSession: false },
  db: { schema: "agency" },
});

const argv = process.argv.slice(2);
const command = argv[0];
const roleRef = argv[1];
const dry = argv.includes("--dry");
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const SEED_NOTE = `SEEDED FIXTURE - ${new Date().toISOString().slice(0, 10)} - not a real person or a real diary`;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function findRole(ref) {
  const { data, error } = await db
    .from("job_roles")
    .select("id, ref, title, company, agency_id, status")
    .eq("ref", ref)
    .maybeSingle();
  if (error) die(`Could not read job_roles: ${error.message}`);
  if (!data) die(`No role with ref ${ref}.`);
  return data;
}

/** The settings the candidate's doorway actually applies. Defaults match
 *  lib/agency/interview-rules.ts, and are what the DB falls back to. */
async function settingsFor(role) {
  const { data } = await db
    .from("interview_settings")
    .select("min_notice_hours, duration_minutes")
    .eq("agency_id", role.agency_id)
    .eq("role_id", role.id)
    .maybeSingle();
  return {
    minNoticeHours: data?.min_notice_hours ?? 24,
    durationMinutes: data?.duration_minutes ?? 45,
  };
}

async function audit(rows) {
  if (rows.length === 0) return;
  const { error } = await db.from("audit_log").insert(rows);
  if (error) die(`Audit write failed, so nothing is trustworthy: ${error.message}`);
}

/* ── windows ────────────────────────────────────────────────────────────────
 * Offer interview windows on a role, relative to now.
 *
 * The two rules the candidate's doorway applies (listOpenWindows) are the
 * whole point: a window must start beyond the minimum notice and be at least
 * as long as the interview. Everything here is generated to clear both with
 * room, so a window is never seeded that the candidate cannot pick — which is
 * exactly the state that made the doorway say "every time has been taken".
 */
async function seedWindows(role) {
  const { minNoticeHours, durationMinutes } = await settingsFor(role);

  const { data: contacts } = await db
    .from("client_contacts")
    .select("id, company")
    .eq("agency_id", role.agency_id)
    .limit(1);
  const contact = contacts?.[0];
  if (!contact) die("That agency has no client contact to offer windows as.");

  const days = flag("days", "2,3,4")
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => Number.isFinite(d) && d > 0);
  const hours = [9, 11, 14];

  // Midnight UTC today, so a slot lands on a clean hour rather than on
  // whatever minute the script happened to run at.
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);

  const wanted = [];
  for (const d of days) {
    for (const h of hours) {
      const start = new Date(midnight.getTime() + d * 86400_000 + h * 3600_000);
      const end = new Date(start.getTime() + 60 * 60_000);
      // Belt and braces: never emit one the doorway would refuse.
      const clearsNotice = start.getTime() > Date.now() + minNoticeHours * 3600_000;
      const longEnough = end.getTime() - start.getTime() >= durationMinutes * 60_000;
      if (clearsNotice && longEnough) wanted.push({ start, end });
    }
  }
  if (wanted.length === 0) {
    die(`Every window generated falls inside the ${minNoticeHours}h notice. Use --days with larger numbers.`);
  }

  // Idempotent: the partial unique index on (contact_id, starts_at) would
  // reject a duplicate anyway, but skipping is quieter than catching.
  const { data: existing } = await db
    .from("availability_slots")
    .select("starts_at")
    .eq("agency_id", role.agency_id)
    .eq("contact_id", contact.id)
    .is("revoked_at", null);
  const taken = new Set((existing ?? []).map((s) => new Date(s.starts_at).toISOString()));
  const fresh = wanted.filter((w) => !taken.has(w.start.toISOString()));

  console.log(`\nRole ${role.ref} — ${role.title}`);
  console.log(`  notice ${minNoticeHours}h · interviews ${durationMinutes} min · client ${contact.company}`);
  console.log(`  ${wanted.length} generated, ${wanted.length - fresh.length} already there, ${fresh.length} to write:`);
  for (const w of fresh) console.log(`    ${w.start.toISOString().replace("T", " ").slice(0, 16)} UTC`);
  if (fresh.length === 0) return console.log("  Nothing to do — the role already has these windows.\n");
  if (dry) return console.log("\n  --dry: nothing written.\n");

  const { data: made, error } = await db
    .from("availability_slots")
    .insert(
      fresh.map((w) => ({
        agency_id: role.agency_id,
        contact_id: contact.id,
        role_id: role.id,
        starts_at: w.start.toISOString(),
        ends_at: w.end.toISOString(),
      }))
    )
    .select("id, starts_at");
  if (error) die(`Insert failed: ${error.message}`);

  // offerSlot writes an audit row in the same operation; a bare insert would
  // leave windows that nobody offered.
  await audit(
    made.map((s) => ({
      agency_id: role.agency_id,
      role_id: role.id,
      actor_id: null,
      entity_type: "availability",
      entity_ref: contact.company ?? "",
      action: "offered",
      to_value: { slot_id: s.id, starts_at: s.starts_at },
      reason: SEED_NOTE,
    }))
  );
  console.log(`\n  Wrote ${made.length} windows and ${made.length} audit rows.\n`);
}

/* ── clone ──────────────────────────────────────────────────────────────────
 * Copy a role's shortlist into a brand-new role, so the interview loop can be
 * walked from the first step without stepping over a half-walked one.
 *
 * It clones the SHORTLIST and stops: requirements, candidates, their evidence
 * and their scores. It deliberately does NOT clone rounds, decisions,
 * references, placements or handover packs — those are the walk itself, and a
 * clone that arrived mid-loop would defeat the purpose.
 *
 * Cloning rather than inventing is the safety property. Every source row
 * already satisfies the constraints that make this schema strict — chiefly
 * evidence_quote_iff_present, which requires missing ⇔ no quote in both
 * directions — so copied rows satisfy them too. Hand-written fixtures are how
 * you get rows that look like bugs.
 */
async function cloneRole(role) {
  const newTitle = flag("title", `${role.title} (walk-through)`);

  const pick = async (table, select, match) => {
    const { data, error } = await db.from(table).select(select).match(match);
    if (error) die(`Could not read ${table}: ${error.message}`);
    return data ?? [];
  };

  const requirements = await pick("requirements", "*", { role_id: role.id });
  const candidates = await pick("candidates", "*", { role_id: role.id });
  const candIds = candidates.map((c) => c.id);
  const evidence = candIds.length
    ? (await db.from("candidate_evidence").select("*").in("candidate_id", candIds)).data ?? []
    : [];
  const scores = candIds.length
    ? (await db.from("score_breakdowns").select("*").in("candidate_id", candIds)).data ?? []
    : [];

  console.log(`\nCloning ${role.ref} — ${role.title}`);
  console.log(`  ${requirements.length} requirements · ${candidates.length} candidates · ${evidence.length} evidence rows · ${scores.length} scores`);
  console.log(`  New role: "${newTitle}"  (rounds, decisions and references are NOT cloned)`);
  if (dry) return console.log("\n  --dry: nothing written.\n");
  if (candidates.length === 0) die("Nothing to clone — that role has no candidates.");

  // A fresh ref from the same service-role RPC the product uses, so the new
  // role is numbered the way every other role is rather than by this script.
  const { data: newRef, error: refErr } = await db.rpc("next_role_ref", { p_agency: role.agency_id });
  if (refErr) die(`Could not mint a role ref (${refErr.message}). Clone aborted before writing anything.`);

  /* Order matters. The first version created the role and its requirements,
   * then failed on the first candidate and left a role with ten requirements
   * and nobody in it. There is no transaction across these calls from here,
   * so the next best thing is to fail before anything is written: if a
   * candidate row cannot be built, say so now. */
  for (const c of candidates) {
    if (!c.full_name && !c.ref) die("A source candidate has neither name nor ref; refusing to clone a broken row.");
  }

  const roleId = randomUUID();
  const { error: roleErr } = await db.from("job_roles").insert({
    ...stripIds(role),
    id: roleId,
    ref: newRef,
    title: newTitle,
    status: "draft",
  });
  if (roleErr) die(`Could not create the role: ${roleErr.message}`);

  const reqMap = new Map();
  if (requirements.length) {
    const rows = requirements.map((r) => {
      const id = randomUUID();
      reqMap.set(r.id, id);
      return { ...stripIds(r), id, role_id: roleId };
    });
    const { error } = await db.from("requirements").insert(rows);
    if (error) die(`Requirements failed: ${error.message}`);
  }

  const candMap = new Map();
  for (const c of candidates) {
    const id = randomUUID();
    candMap.set(c.id, id);
    const { data: candRef } = await db.rpc("next_candidate_ref", { p_role: roleId });
    const { error } = await db.from("candidates").insert({
      ...stripIds(c),
      id,
      role_id: roleId,
      ref: candRef ?? c.ref,
    });
    if (error) {
      // Leave no shell behind. The role is seconds old and has nothing on it
      // but requirements, so removing it is safe and is the honest cleanup.
      await db.from("job_roles").delete().eq("id", roleId);
      die(`Candidate failed (${error.message}). Rolled the new role back; nothing was left behind.`);
    }
  }

  if (evidence.length) {
    const rows = evidence.map((e) => ({
      ...stripIds(e),
      id: randomUUID(),
      candidate_id: candMap.get(e.candidate_id),
      requirement_id: reqMap.get(e.requirement_id) ?? e.requirement_id,
    }));
    const { error } = await db.from("candidate_evidence").insert(rows);
    if (error) die(`Evidence failed: ${error.message}`);
  }

  if (scores.length) {
    const rows = scores.map((s) => ({
      ...stripIds(s),
      id: randomUUID(),
      candidate_id: candMap.get(s.candidate_id),
      // The effective map is keyed by requirement id and must be remapped, or
      // the new role's scores would point at the old role's requirements.
      effective: remapKeys(s.effective, reqMap),
    }));
    const { error } = await db.from("score_breakdowns").insert(rows);
    if (error) die(`Scores failed: ${error.message}`);
  }

  await audit([
    {
      agency_id: role.agency_id,
      role_id: roleId,
      actor_id: null,
      entity_type: "role",
      entity_ref: newRef,
      action: "created",
      to_value: { cloned_from: role.ref, candidates: candidates.length },
      reason: SEED_NOTE,
    },
  ]);

  console.log(`\n  Created ${newRef} with ${candidates.length} candidates.`);
  console.log(`  Next: open it at step 01, send it to your client, then walk the interview loop.\n`);
}

/**
 * Columns a clone must not carry over.
 *
 * `rights_token` is the one that bit: it is globally unique
 * (candidates_rights_token_idx) AND database-generated
 * (encode(gen_random_bytes(24),'hex')), so copying it fails the insert — and
 * it failed AFTER the role and its requirements were written, leaving a
 * half-built role behind. Dropping it lets Postgres mint a new one, which is
 * also the only correct answer: a rights token is a candidate's private door
 * to their own data and must never be shared between two people.
 *
 * The general rule this encodes: never clone a column the database generates.
 */
function stripIds(row) {
  const out = { ...row };
  for (const col of ["id", "created_at", "updated_at", "rights_token"]) delete out[col];
  return out;
}

function remapKeys(obj, map) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[map.get(k) ?? k] = v;
  return out;
}

/* ── state ─────────────────────────────────────────────────────────────────
 * What a walker would actually find, computed the way the product computes
 * it — the check that "verify the effect, not the status code" asks for.
 */
async function showState(role) {
  const { minNoticeHours, durationMinutes } = await settingsFor(role);
  const { data: rounds } = await db
    .from("interview_rounds")
    .select("slot_id, status, candidate_response, booking_token_hash")
    .eq("role_id", role.id);
  const { data: slots } = await db
    .from("availability_slots")
    .select("id, role_id, starts_at, ends_at")
    .eq("agency_id", role.agency_id)
    .is("revoked_at", null);
  const { data: allRounds } = await db
    .from("interview_rounds")
    .select("slot_id, status")
    .eq("agency_id", role.agency_id);

  const held = new Set((allRounds ?? []).filter((r) => r.status !== "cancelled" && r.slot_id).map((r) => r.slot_id));
  const pickable = (slots ?? []).filter(
    (s) =>
      (!s.role_id || s.role_id === role.id) &&
      !held.has(s.id) &&
      Date.parse(s.starts_at) > Date.now() + minNoticeHours * 3600_000 &&
      Date.parse(s.ends_at) - Date.parse(s.starts_at) >= durationMinutes * 60_000
  );
  const awaiting = (rounds ?? []).filter((r) => !r.slot_id && r.status === "scheduled");
  const withLink = awaiting.filter((r) => r.booking_token_hash);

  console.log(`\nRole ${role.ref} — ${role.title}`);
  console.log(`  candidates waiting to pick a time : ${awaiting.length}`);
  console.log(`  ...of those, holding a live link  : ${withLink.length}`);
  console.log(`  windows they can actually pick    : ${pickable.length}`);
  if (pickable.length === 0 && awaiting.length > 0) {
    console.log(`\n  The doorway will offer nothing. Run:  node scripts/seed-walkthrough.mjs windows ${role.ref}`);
  }
  console.log();
}

const COMMANDS = { windows: seedWindows, clone: cloneRole, state: showState };

if (!COMMANDS[command] || !roleRef) {
  console.error(
    [
      "Usage:",
      "  node scripts/seed-walkthrough.mjs state   ROL-2411",
      "  node scripts/seed-walkthrough.mjs windows ROL-2411 [--days 2,3,4] [--dry]",
      "  node scripts/seed-walkthrough.mjs clone   ROL-2411 [--title \"...\"] [--dry]",
    ].join("\n")
  );
  process.exit(1);
}

const role = await findRole(roleRef);
await COMMANDS[command](role);
