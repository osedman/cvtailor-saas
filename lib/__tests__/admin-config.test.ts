/**
 * Admin area Phase 3 (19 Nov 2026): off switches, the staging email
 * allowlist, and a record of scheduled runs.
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  ALLOWLIST_KEY,
  KILL_KEYS,
  courseSourceKillKeys,
  extraAllowlist,
  isKillKey,
  isKilled,
  parseAllowlistAddress,
  safeCronSummary,
} from "@/lib/admin-config"
import { describeActivity } from "@/lib/admin-activity-text"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf-8")

describe("off switches", () => {
  it("only an explicit {off:true} turns something off", () => {
    expect(isKilled({ "kill.market_insights": { off: true } }, "kill.market_insights")).toBe(true)
    expect(isKilled({ "kill.market_insights": { off: false } }, "kill.market_insights")).toBe(false)
    expect(isKilled({ "kill.market_insights": "true" }, "kill.market_insights")).toBe(false)
    expect(isKilled({ "kill.market_insights": null }, "kill.market_insights")).toBe(false)
    expect(isKilled({}, "kill.market_insights")).toBe(false)
  })

  it("the all-sources switch stops every course source; each source also has its own", () => {
    expect(courseSourceKillKeys("curated")).toEqual(["kill.course_sources"])
    expect(courseSourceKillKeys("youtube")).toEqual(["kill.course_sources", "kill.course_youtube"])
    expect(courseSourceKillKeys("microsoft-learn")).toEqual(["kill.course_sources", "kill.course_microsoft_learn"])
  })

  it("only the known keys are switches", () => {
    for (const k of KILL_KEYS) expect(isKillKey(k)).toBe(true)
    expect(isKillKey("kill.everything")).toBe(false)
    expect(isKillKey(ALLOWLIST_KEY)).toBe(false)
  })

  it("a switch can only take a feature AWAY from what the environment allows", () => {
    // Market: the environment check comes first, and the switch only negates.
    const market = tsCode(read("lib/job-market.ts"))
    expect(market).toMatch(/if \(!isMarketEnabled\(\)\) return false\s+return !\(await anyKilled\(\["kill\.market_insights"\]\)\)/)
    // Courses: enabled() AND not killed.
    expect(tsCode(read("lib/course-sources/index.ts"))).toContain("source.enabled() && !courseSourceKillKeys(source.id).some((k) => isKilled(settings, k))")
  })

  it("the routes that serve the market ask the live check, not the environment alone", () => {
    const route = tsCode(read("app/api/career-path/market/route.ts"))
    expect(route.match(/await isMarketLive\(\)/g)?.length).toBe(2)
    expect(route).not.toContain("isMarketEnabled")
  })
})

describe("settings read", () => {
  const src = read("lib/admin-settings.ts")

  it("a failed read follows the environment: nothing off, nobody extra allowed", () => {
    expect(src).toMatch(/catch \(e\) \{[\s\S]*?settings = \{\}/)
  })

  it("does not drag next/headers into lib/email's importers", () => {
    expect(tsCode(src)).not.toMatch(/lib\/supabase\/server|next\/headers/)
  })

  it("recording a cron run can never fail the cron", () => {
    const fn = src.slice(src.indexOf("export async function recordCronRun"))
    expect(fn).toMatch(/try \{[\s\S]*\} catch \(e\) \{/)
    expect(fn).not.toMatch(/throw /)
  })
})

describe("staging email allowlist", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock("@/lib/admin-settings") })

  it("takes one exact address and refuses a whole domain", () => {
    expect(parseAllowlistAddress(" Tester@Example.com ")).toEqual({ email: "tester@example.com" })
    expect(parseAllowlistAddress("@example.com")).toHaveProperty("error")
    expect(parseAllowlistAddress("a@b.co, c@d.co")).toHaveProperty("error")
    expect(parseAllowlistAddress("not an email")).toHaveProperty("error")
    expect(parseAllowlistAddress(null)).toHaveProperty("error")
  })

  it("reads the stored list defensively", () => {
    expect(extraAllowlist({ [ALLOWLIST_KEY]: { addresses: ["a@b.co", 3, null] } })).toEqual(["a@b.co"])
    expect(extraAllowlist({ [ALLOWLIST_KEY]: "a@b.co" })).toEqual([])
    expect(extraAllowlist({})).toEqual([])
  })

  async function send(to: string, extras: string[], env: Record<string, string>) {
    vi.resetModules()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.stubEnv("RESEND_API_KEY", "re_test")
    const stagingAllowlistExtras = vi.fn(async () => extras)
    vi.doMock("@/lib/admin-settings", () => ({ stagingAllowlistExtras }))
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
    const { sendEmail } = await import("../email")
    const result = await sendEmail({ to, subject: "s", html: "<p>h</p>" })
    const called = fetchSpy.mock.calls.length
    fetchSpy.mockRestore()
    return { result, called, readSettings: stagingAllowlistExtras.mock.calls.length }
  }

  it("an address added from the admin screen can be emailed on staging", async () => {
    const r = await send("tester@example.com", ["tester@example.com"], { VERCEL_ENV: "preview" })
    expect(r.result.sent).toBe(true)
  })

  it("it ADDS to the environment's list rather than replacing it", async () => {
    const r = await send("kept@example.com", ["tester@example.com"], { VERCEL_ENV: "preview", EMAIL_ALLOWLIST: "kept@example.com" })
    expect(r.result.sent).toBe(true)
  })

  it("anyone else is still refused, before any network call", async () => {
    const r = await send("stranger@example.com", ["tester@example.com"], { VERCEL_ENV: "preview" })
    expect(r.result.sent).toBe(false)
    expect(r.called).toBe(0)
  })

  it("a domain entry that somehow reached the stored list is ignored", async () => {
    const r = await send("stranger@example.com", ["@example.com"], { VERCEL_ENV: "preview" })
    expect(r.result.sent).toBe(false)
  })

  it("production never reads the admin list at all", async () => {
    const r = await send("anyone@example.com", [], { VERCEL_ENV: "production" })
    expect(r.result.sent).toBe(true)
    expect(r.readSettings).toBe(0)
  })
})

describe("scheduled run records", () => {
  it("keep counts and short words, and never an address", () => {
    expect(safeCronSummary({ notices_sent: 2, ok: true, failed_at: "purge", who: "a@b.co", nested: { x: 1 }, long: "x".repeat(81) }))
      .toEqual({ notices_sent: 2, ok: true, failed_at: "purge" })
    expect(safeCronSummary(null)).toEqual({})
  })

  it("the agency cron records its outcome on every exit after authorisation", () => {
    const src = tsCode(read("app/api/agency/cron/route.ts"))
    expect(src.match(/await recordCronRun\("agency-daily"/g)?.length).toBe(3)
    expect(src).toContain('recordCronRun("agency-daily", startedAt, true, safeCronSummary(summary))')
  })

  it("the weekly cron records which job ran, not the job's response body", () => {
    const src = tsCode(read("app/api/cron/weekly/route.ts"))
    expect(src).toContain("await recordCronRun(`weekly:${path}`, startedAt, res.ok, { status: res.status })")
  })
})

describe("the configuration route", () => {
  const src = read("app/api/admin/config/route.ts")
  const code = tsCode(src)

  it("support reads; only an admin with two-step changes anything", () => {
    expect(src).toContain('requireAdmin("support")')
    expect(src).toContain('requireAdmin("admin", { twoStep: true })')
  })

  it("writes only through the audited database function", () => {
    expect(code).toContain('admin.rpc("admin_set_setting"')
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(/)
  })

  it("switching back on clears the row rather than storing an 'on'", () => {
    expect(code).toContain("value = body.off ? { off: true } : null")
  })

  it("never returns the environment's own addresses, only how many", () => {
    const get = code.slice(code.indexOf("async function GET_handler"), code.indexOf("const RPC_ERRORS"))
    expect(get).toContain("environmentCount: envList.length")
    expect(get).not.toMatch(/environment(Addresses|List):/)
    expect(get).not.toMatch(/\benvList\b(?!\.length)/g.source ? /envList,|envList\s*\}|: envList\b(?!\.)/ : /x/)
  })

  it("a missing settings table reads as a failure, not as nothing set", () => {
    expect(code).toContain("if (meta.error) throw meta.error")
  })
})

describe("migration 20261119120000_admin_config", () => {
  const sql = read("supabase/migrations/20261119120000_admin_config.sql")

  it("only the known keys can be stored", () => {
    for (const k of [...KILL_KEYS, ALLOWLIST_KEY]) expect(sql).toContain(`'${k}'`)
    expect(sql).toMatch(/check \(key in \(/)
  })

  it("the service role can read settings but writes only through the function", () => {
    expect(sql).toContain("revoke all on public.admin_settings from anon, authenticated, service_role")
    expect(sql).toContain("grant select on public.admin_settings to service_role")
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*admin_settings/i)
  })

  it("the function is server-only, pinned, and logs in the same transaction", () => {
    expect(sql).toMatch(/revoke execute on function public\.admin_set_setting\(uuid, text, jsonb, text\)\s+from public, anon, authenticated/)
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain("insert into public.admin_audit_log")
  })

  it("run records are append-only for the server and closed to browsers", () => {
    expect(sql).toContain("revoke all on public.cron_runs from anon, authenticated, service_role")
    expect(sql).toContain("grant select, insert on public.cron_runs to service_role")
  })

  it("no email address enters the migration — the repo is public", () => {
    expect(sql).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  })
})

describe("activity wording for configuration", () => {
  const base = { area: "config", action: "setting_changed", actorName: "Amara Okoye" }

  it("reads as a sentence", () => {
    expect(describeActivity({ ...base, targetName: "kill.course_sources", from: null, to: { off: true } }))
      .toBe("Amara Okoye switched course sync off")
    expect(describeActivity({ ...base, targetName: "kill.course_sources", from: { off: true }, to: null }))
      .toBe("Amara Okoye switched course sync back on")
    expect(describeActivity({ ...base, targetName: ALLOWLIST_KEY, from: null, to: { addresses: ["tester@example.com"] } }))
      .toBe("Amara Okoye allowed staging to email tester@example.com")
    expect(describeActivity({ ...base, targetName: ALLOWLIST_KEY, from: { addresses: ["a@b.co", "tester@example.com"] }, to: { addresses: ["a@b.co"] } }))
      .toBe("Amara Okoye stopped staging emailing tester@example.com")
  })
})

describe("the Configuration screen", () => {
  const page = read("app/admin/config/page.tsx")

  it("is in the nav for support and up", () => {
    expect(read("components/admin/admin-shell.tsx")).toMatch(/href: "\/admin\/config"[^}]*needs: "support"/)
  })

  it("offers no switch when the environment already has the feature off", () => {
    expect(page).toContain('const offer = s.switchedOff ? "Switch back on" : s.environmentOn ? "Switch off" : null')
  })

  it("only an admin sees controls, and they are off without two-step", () => {
    expect(page).toContain("const canWrite = isAdmin && me.canWrite")
    expect(page).toContain("{offer && isAdmin && (")
  })

  it("every change sends a reason", () => {
    expect(page).toContain('send({ type: "switch", key: pending.key, off: pending.off, reason })')
    expect(page).toContain('send({ type: "allowlist", action: "remove", email: pending.email, reason })')
    expect(page).toContain('send({ type: "allowlist", action: "add", email: parsed.email, reason: addReason })')
  })

  it("uses no mono", () => {
    expect(page).not.toMatch(/font-mono|monospace/)
  })
})
