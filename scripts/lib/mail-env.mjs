/**
 * Shared env resolution and send guards for the scripts/send-*.mjs mailers.
 *
 * Exists because the three send scripts each loaded a different env file
 * (.env.local vs .env.development.local), so whether a mailer worked depended
 * on which file happened to hold RESEND_API_KEY. Resolution order here is:
 * real shell env first, then .env.mail.local, then .env.local, then
 * .env.development.local.
 *
 * The sender guard is deliberately stricter than a substring match: the From
 * address must END in a gettailr.com address, and — via assertVerifiedSender —
 * that domain must come back `verified` from Resend's own /domains endpoint.
 * A regex only checks the spelling of the env var; the API call checks whether
 * mail will actually leave the building.
 */
import fs from "node:fs";
import path from "node:path";

// .env.mail.local is read FIRST and is for the mailers only. Next.js does not
// load it, so production credentials can live there for a send without
// repointing the local dev server at the production database.
const ENV_FILES = [".env.mail.local", ".env.local", ".env.development.local"];

function parseEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return {}; // a missing env file is normal, not an error
  }
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.replace(/^export\s+/, "");
    const i = withoutExport.indexOf("=");
    if (i <= 0) continue;
    const key = withoutExport.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out[key] = withoutExport
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * Merge the shell env over every known env file. Earlier files win over later
 * ones; anything already exported in the shell beats all of them.
 */
export function loadMailEnv(rootDir = process.cwd()) {
  const merged = {};
  for (const name of [...ENV_FILES].reverse()) {
    Object.assign(merged, parseEnvFile(path.join(rootDir, name)));
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && v !== "") merged[k] = v;
  }
  return merged;
}

/** "Tailr <hello@gettailr.com>" -> "gettailr.com" */
export function senderDomain(from) {
  const angle = /<([^>]+)>/.exec(from || "");
  const address = (angle ? angle[1] : from || "").trim();
  return (address.split("@")[1] || "").toLowerCase();
}

const die = (...lines) => {
  for (const l of lines) console.error(l);
  process.exit(1);
};

/**
 * Resolve and validate everything a mailer needs. Exits with a consistent
 * message rather than letting each script invent its own.
 */
export function requireMailEnv({ rootDir = process.cwd(), requireSupabase = true } = {}) {
  const env = loadMailEnv(rootDir);
  const RESEND_API_KEY = env.RESEND_API_KEY;
  const FROM = env.WELCOME_FROM || "Tailr <hello@gettailr.com>";
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!RESEND_API_KEY) {
    die(
      "RESEND_API_KEY missing.",
      `Looked in the shell env and: ${ENV_FILES.join(", ")}`,
    );
  }
  if (!/@gettailr\.com>?\s*$/.test(FROM)) {
    die(
      `Refusing to send: WELCOME_FROM is "${FROM}".`,
      "Only gettailr.com is a verified sender — anything else silently fails to deliver.",
    );
  }
  if (requireSupabase && (!SUPABASE_URL || !SERVICE_KEY)) {
    die(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      `Looked in the shell env and: ${ENV_FILES.join(", ")}`,
    );
  }
  // A placeholder authenticates as nothing and surfaces as an opaque Supabase
  // 401 several frames deep. Name it here instead.
  if (requireSupabase && !/^(eyJ|sb_secret|sbp_)/.test(SERVICE_KEY)) {
    die(
      "SUPABASE_SERVICE_ROLE_KEY looks like a placeholder, not a key.",
      `It reads "${SERVICE_KEY.slice(0, 12)}..." (${SERVICE_KEY.length} chars); a real one starts eyJ or sb_secret.`,
      "Put the production service_role key in .env.mail.local.",
    );
  }

  return { env, RESEND_API_KEY, FROM, SUPABASE_URL, SERVICE_KEY };
}

/**
 * Ask Resend whether the From domain is actually verified right now. Catches
 * the case a regex cannot: a domain that was set up correctly and has since
 * failed DNS verification, which delivers nothing while looking fine locally.
 */
export async function assertVerifiedSender(from, apiKey) {
  const domain = senderDomain(from);
  let res;
  try {
    res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    die(`Could not reach Resend to verify the sender domain: ${err.message}`);
  }
  if (!res.ok) {
    die(`Resend rejected the API key (${res.status}). Refusing to send.`);
  }
  const body = await res.json().catch(() => ({}));
  const domains = Array.isArray(body) ? body : body.data || [];
  const match = domains.find((d) => (d.name || "").toLowerCase() === domain);
  if (!match) {
    die(
      `Refusing to send: "${domain}" is not a domain on this Resend account.`,
      `Known domains: ${domains.map((d) => d.name).join(", ") || "(none)"}`,
    );
  }
  if (match.status !== "verified") {
    die(
      `Refusing to send: "${domain}" is "${match.status}" on Resend, not verified.`,
      "Mail from an unverified domain is accepted by the API and then not delivered.",
    );
  }
  console.log(`Sender:  ${domain} — verified on Resend`);
  return match;
}
