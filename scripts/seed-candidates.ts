/**
 * Seed candidates into a staging role THROUGH THE REAL INGEST PATH.
 *
 *   npx tsx --tsconfig tsconfig.json --env-file=.env.development.local \
 *     scripts/seed-candidates.ts --role ROL-2419 --dir scripts/seed-content/ba-role [--dry] [--concurrency 4]
 *
 * Why the real path and not rows: hand-written score_breakdowns carry a stale
 * inputs_hash that submission generation refuses, and hand-written evidence
 * breaks the missing⇔quote promise. ingestCandidate runs the same extraction,
 * the same evidence rules and the same scoring as the Add-candidates screen,
 * so everything it leaves behind is real. Same safety shape as
 * seed-walkthrough.mjs: staging only by allow-list, --dry first, never deletes,
 * and a SEEDED FIXTURE audit row with a NULL actor on the role.
 */
import fs from "node:fs"
import path from "node:path"
import { ingestCandidate } from "@/lib/agency/ingest"
import { agencyAdmin } from "@/lib/agency/db"
import type { AgencyContext } from "@/lib/agency/types"

const STAGING_REF = "pwonuqkpumgejqmotkwh"
const SEED_NOTE = "SEEDED FIXTURE — scripts/seed-candidates.ts. Fictional people; not a person's act."

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const dry = process.argv.includes("--dry")
const roleRef = arg("role")
const dir = arg("dir")
const concurrency = Number(arg("concurrency", "4"))
if (!roleRef || !dir) {
  console.error("Need --role ROL-NNNN and --dir <folder of .txt CVs>")
  process.exit(2)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
if (!url.includes(STAGING_REF)) {
  console.error(`Refusing: NEXT_PUBLIC_SUPABASE_URL is not the staging project (${STAGING_REF}).`)
  process.exit(3)
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY in the env file.")
  process.exit(3)
}

async function main() {
  const admin = agencyAdmin()
  const { data: role, error } = await admin
    .from("job_roles")
    .select("id, agency_id, ref, title, status")
    .eq("ref", roleRef)
    .is("discarded_at", null)
    .maybeSingle()
  if (error) throw error
  if (!role) throw new Error(`No live role ${roleRef} on staging`)
  const { data: owner } = await admin.from("members").select("user_id").eq("agency_id", role.agency_id).eq("role", "owner").limit(1).maybeSingle()
  if (!owner) throw new Error("No owner on that agency")
  const ctx: AgencyContext = { agencyId: role.agency_id as string, userId: owner.user_id as string, role: "owner" }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()
  const { count: before } = await admin.from("candidates").select("id", { count: "exact", head: true }).eq("role_id", role.id)
  console.log(`${roleRef} "${role.title}" (${role.status}) · ${before ?? 0} candidates now · ${files.length} CVs in ${dir} · concurrency ${concurrency}${dry ? " · DRY RUN" : ""}`)
  if (dry) {
    for (const f of files) console.log(`  would ingest ${f} (${fs.readFileSync(path.join(dir, f), "utf8").split(/\s+/).length} words)`)
    return
  }

  const queue = [...files]
  const done: Array<{ file: string; ref?: string; overall?: number; error?: string }> = []
  let shownKeys = false
  async function worker() {
    for (;;) {
      const f = queue.shift()
      if (!f) return
      const cvText = fs.readFileSync(path.join(dir, f), "utf8")
      try {
        const r = (await ingestCandidate(ctx, admin as never, role!.id as string, { cvText, source: "paste", sourceDetail: `${path.basename(dir)}/${f}` })) as Record<string, unknown>
        if (!shownKeys) { shownKeys = true; console.log(`  (result keys: ${Object.keys(r).join(", ")})`) }
        const cand = (r.candidate ?? {}) as Record<string, unknown>
        const score = (r.score ?? r.breakdown ?? {}) as Record<string, unknown>
        const row = { file: f, ref: (cand.ref ?? r.ref) as string | undefined, overall: (score.overall ?? r.overall) as number | undefined }
        done.push(row)
        console.log(`  ✓ ${f} → ${row.ref ?? "?"} · overall ${row.overall ?? "?"}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        done.push({ file: f, error: msg })
        console.log(`  ✗ ${f} → ${msg}`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  const ok = done.filter((d) => !d.error)
  await admin.from("audit_log").insert({
    agency_id: role.agency_id,
    role_id: role.id,
    actor_id: null,
    entity_type: "role",
    entity_ref: role.ref,
    action: "candidates_seeded",
    to_value: { count: ok.length, files: ok.map((d) => d.file), failed: done.filter((d) => d.error).map((d) => d.file) },
    reason: SEED_NOTE,
  })
  const { count: after } = await admin.from("candidates").select("id", { count: "exact", head: true }).eq("role_id", role.id)
  console.log(`\n${ok.length}/${files.length} ingested · role now has ${after ?? "?"} candidates`)
  if (ok.length !== files.length) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exit(1) })
