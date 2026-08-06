"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Loader2, RefreshCw, ShieldCheck,
  TrendingUp, Clock, Users, RotateCcw, AlertTriangle,
  LogIn, Sparkles, Kanban,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"
import { isAdminEmail } from "@/lib/admin"
import type {
  ProductHealth, FunnelStage, CohortWeek, StuckBucket, VolumeMetrics, DayCount,
  ActivityDirectory,
} from "@/lib/admin-metrics"

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString([], {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function relDay(iso: string | null) {
  if (!iso) return "Never"
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return `${diff}d ago`
}

// ── Types ──────────────────────────────────────────────────────────────

interface StatsPayload {
  health: ProductHealth
  generatedAt: string
  env: string
}

// ── Small UI primitives ────────────────────────────────────────────────

function Kpi({
  icon, label, value, sub, delta,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  delta?: number | null
}) {
  return (
    <div className="rounded-xl border border-[#eee6da] bg-[#fdfcf9] p-5">
      <div className="flex items-center gap-2 text-[#1e1813]/60">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[#1e1813]">
        {value}
      </p>
      {sub && <p className="mt-1 text-[12px] text-[#1e1813]/55">{sub}</p>}
      {delta != null && (
        <p className={`mt-1 text-[11px] font-medium tabular-nums ${
          delta > 0 ? "text-emerald-700" : delta < 0 ? "text-[#b3341b]" : "text-[#1e1813]/45"
        }`}>
          {delta > 0 ? "+" : ""}{delta}pp vs prior week
        </p>
      )}
    </div>
  )
}

function Section({
  title, meaning, children,
}: {
  title: string
  meaning: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#eee6da] bg-[#fdfcf9] p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-[#1e1813]">{title}</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#1e1813]/55">{meaning}</p>
      </header>
      {children}
    </section>
  )
}

function BarChart({
  data, color = "#dc4f33", height = 100,
}: {
  data: DayCount[]
  color?: string
  height?: number
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const showEvery = data.length > 14 ? 7 : data.length > 7 ? 2 : 1
  return (
    <div className="w-full">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            <div className="absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-[#1e1813] px-2 py-1 text-[10px] text-white group-hover:block">
              {d.label.slice(5)}: {d.value}
            </div>
            <div
              className="w-full rounded-t transition-all group-hover:opacity-80"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 3 : 1,
                background: d.value > 0 ? color : "#f3f4f6",
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 text-center">
            <span className="text-[8px] text-[#1e1813]/30">
              {i % showEvery === 0 ? d.label.slice(8) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VolumeSection({ v }: { v: VolumeMetrics }) {
  return (
    <Section
      title="Volume & activity"
      meaning="The old dashboard counters — useful for scale, not for whether the product works. Sign-ins are last_sign_in_at; tailor activity is runs."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<Users className="h-3.5 w-3.5" />}
          label="Total users"
          value={String(v.totalUsers)}
          sub={`${v.neverTailored} never tailored · ${v.proUsers} pro`}
        />
        <Kpi
          icon={<LogIn className="h-3.5 w-3.5" />}
          label="Active users (sign-in)"
          value={String(v.wau)}
          sub={`DAU ${v.dau} · MAU ${v.mau}`}
        />
        <Kpi
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Tailors (30d)"
          value={String(v.tailorRuns30d)}
          sub={`${v.tailorRunsAllTime} all-time`}
        />
        <Kpi
          icon={<Kanban className="h-3.5 w-3.5" />}
          label="Tracked jobs"
          value={String(v.trackedJobs)}
          sub={`${v.offers} at offer`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#eee6da] bg-white p-4">
          <p className="mb-1 text-[12px] font-medium text-[#1e1813]">Logins per day</p>
          <p className="mb-3 text-[11px] text-[#1e1813]/45">Last 30 days · counts only</p>
          <BarChart data={v.loginsPerDay} color="#dc4f33" />
        </div>
        <div className="rounded-lg border border-[#eee6da] bg-white p-4">
          <p className="mb-1 text-[12px] font-medium text-[#1e1813]">Signups per day</p>
          <p className="mb-3 text-[11px] text-[#1e1813]/45">Last 30 days</p>
          <BarChart data={v.signupsPerDay} color="#1e1813" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#eee6da] bg-white p-4 lg:col-span-2">
          <p className="mb-1 text-[12px] font-medium text-[#1e1813]">Tailoring runs per day</p>
          <p className="mb-3 text-[11px] text-[#1e1813]/45">Last 14 days</p>
          <BarChart data={v.tailorsPerDay} color="#b3341b" height={90} />
        </div>
        <div className="rounded-lg border border-[#eee6da] bg-white p-4">
          <p className="mb-3 text-[12px] font-medium text-[#1e1813]">Top tailorers</p>
          <div className="space-y-2.5">
            {v.topTailorers.map((t, i) => (
              <div key={`${t.label}-${i}`} className="flex items-center gap-2">
                <span className="w-4 text-[10px] font-bold text-[#1e1813]/30">#{i + 1}</span>
                <span className="flex-1 truncate text-[12px] text-[#1e1813]/70">
                  {t.label}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-[#dc4f33]">
                  {t.tailors}
                </span>
              </div>
            ))}
            {v.topTailorers.length === 0 && (
              <p className="text-[12px] text-[#1e1813]/40">No usage yet</p>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

function ActivitySection({ activity }: { activity: ActivityDirectory }) {
  return (
    <Section
      title="User activity"
      meaning="Live from Supabase auth + login_events. Emails visible to admin viewers; IPs stay off the page."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-[#eee6da] bg-white">
          <div className="border-b border-[#eee6da] px-4 py-3">
            <p className="text-[12px] font-medium text-[#1e1813]">Recent logins</p>
            <p className="text-[11px] text-[#1e1813]/45">Last 30 days · magic-link sign-ins</p>
          </div>
          {activity.recentLogins.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[#1e1813]/40">
              No login events yet.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-[#eee6da] overflow-y-auto">
              {activity.recentLogins.map((l, i) => (
                <li key={`${l.email}-${l.created_at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="truncate text-[12px] text-[#1e1813]">{l.email}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#1e1813]/45">
                    {fmtDateTime(l.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[#eee6da] bg-white">
          <div className="border-b border-[#eee6da] px-4 py-3">
            <p className="text-[12px] font-medium text-[#1e1813]">
              All users ({activity.users.length})
            </p>
            <p className="text-[11px] text-[#1e1813]/45">Sorted by most recent sign-in</p>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#eee6da] text-[10px] uppercase tracking-wide text-[#1e1813]/40">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Last sign-in</th>
                  <th className="px-4 py-2 text-right font-medium">Tailors</th>
                </tr>
              </thead>
              <tbody>
                {activity.users.map((u) => (
                  <tr key={u.id} className="border-b border-[#eee6da]/60 last:border-0">
                    <td className="max-w-[14rem] truncate px-4 py-2 text-[12px] text-[#1e1813]">
                      {u.email}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-[#1e1813]/55">
                      <span className={relDay(u.last_sign_in_at) === "Today" ? "font-medium text-emerald-700" : ""}>
                        {relDay(u.last_sign_in_at)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-[12px] tabular-nums text-[#1e1813]/70">
                      {u.tailors_used}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Section>
  )
}

function CohortChart({ cohorts }: { cohorts: CohortWeek[] }) {
  const max = Math.max(1, ...cohorts.map((c) => c.signedUp))
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2" style={{ height: 140 }}>
        {cohorts.map((c) => (
          <div key={c.weekStart} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#1e1813] px-2 py-1 text-[10px] text-white group-hover:block">
              {c.signedUp} signed · {c.tailoredRate}% tailored in 7d
            </div>
            <div
              className="w-full rounded-t bg-[#f5d9d0]"
              style={{ height: `${(c.signedUp / max) * 100}%`, minHeight: c.signedUp > 0 ? 4 : 2 }}
            >
              <div
                className="w-full rounded-t bg-[#dc4f33]"
                style={{
                  height: c.signedUp === 0 ? 0 : `${(c.tailoredIn7d / c.signedUp) * 100}%`,
                  minHeight: c.tailoredIn7d > 0 ? 3 : 0,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {cohorts.map((c) => (
          <div key={c.weekStart} className="flex-1 text-center">
            <p className="text-[10px] tabular-nums text-[#1e1813]/45">{c.label}</p>
            <p className="text-[11px] font-medium tabular-nums text-[#1e1813]">
              {c.tailoredRate}%
            </p>
            {c.delta != null && (
              <p className={`text-[10px] tabular-nums ${
                c.delta > 0 ? "text-emerald-700" : c.delta < 0 ? "text-[#b3341b]" : "text-[#1e1813]/40"
              }`}>
                {c.delta > 0 ? "+" : ""}{c.delta}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#1e1813]/45">
        Coral = tailored within 7 days of signup. Tint = total signups that week.
      </p>
    </div>
  )
}

function FunnelBars({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, stages[0]?.count ?? 1)
  return (
    <div className="space-y-2.5">
      {stages.map((s) => (
        <div key={s.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <div>
            <p className="text-[13px] font-medium text-[#1e1813]">{s.label}</p>
            <p className="text-[10px] text-[#1e1813]/45" title={s.meaning}>
              {s.shareOfTotal}% of signups
            </p>
          </div>
          <div className="h-7 overflow-hidden rounded bg-[#fff7f4]">
            <div
              className="flex h-full items-center rounded bg-[#dc4f33] px-2 transition-all"
              style={{ width: `${Math.max(s.count === 0 ? 0 : 4, (s.count / max) * 100)}%` }}
            >
              {s.count > 0 && (s.count / max) > 0.12 && (
                <span className="text-[11px] font-medium tabular-nums text-white">{s.count}</span>
              )}
            </div>
          </div>
          <div className="min-w-[3.5rem] text-right">
            <p className="text-[13px] font-semibold tabular-nums text-[#1e1813]">{s.count}</p>
            {s.conversionFromPrev != null && (
              <p className="text-[10px] tabular-nums text-[#1e1813]/45">
                {s.conversionFromPrev}% ←
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreBars({ buckets, total }: {
  buckets: { low: number; medium: number; strong: number }
  total: number
}) {
  const rows = [
    { label: "< 60", value: buckets.low, color: "#b3341b" },
    { label: "60–79", value: buckets.medium, color: "#dc4f33" },
    { label: "80+", value: buckets.strong, color: "#1e1813" },
  ]
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
          <span className="text-[12px] tabular-nums text-[#1e1813]/60">{r.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#fff7f4]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${total === 0 ? 0 : (r.value / total) * 100}%`,
                background: r.color,
              }}
            />
          </div>
          <span className="text-right text-[12px] tabular-nums text-[#1e1813]">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function AdoptionRow({
  label, count, total, hint, unit,
}: {
  label: string
  count: number
  total?: number
  hint?: string
  /** When set, show as absolute count with this unit instead of % of users. */
  unit?: string
}) {
  const rate = total == null || total === 0 ? null : Math.round((count / total) * 100)
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#eee6da] py-3 last:border-0">
      <div>
        <p className="text-[13px] font-medium text-[#1e1813]">{label}</p>
        {hint && <p className="text-[11px] text-[#1e1813]/45">{hint}</p>}
      </div>
      <div className="text-right">
        <p className="text-[15px] font-semibold tabular-nums text-[#1e1813]">{count}</p>
        <p className="text-[11px] tabular-nums text-[#1e1813]/45">
          {unit ?? (rate == null ? "" : `${rate}% of users`)}
        </p>
      </div>
    </div>
  )
}

function StuckList({ buckets }: { buckets: StuckBucket[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {buckets.map((b) => (
        <div key={b.key} className="rounded-lg border border-[#eee6da] bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-[#1e1813]">{b.label}</p>
              <p className="mt-0.5 text-[11px] text-[#1e1813]/50">{b.meaning}</p>
            </div>
            <span className="rounded-md bg-[#fff7f4] px-2 py-0.5 text-[13px] font-semibold tabular-nums text-[#b3341b]">
              {b.count}
            </span>
          </div>
          {b.users.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {b.users.map((u) => (
                <li
                  key={`${b.key}-${u}`}
                  className="rounded bg-[#f9f6f0] px-2 py-0.5 text-[11px] text-[#1e1813]/70"
                >
                  {u}
                </li>
              ))}
              {b.count > b.users.length && (
                <li className="px-1 text-[11px] text-[#1e1813]/40">
                  +{b.count - b.users.length} more
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] text-[#1e1813]/40">None — good.</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch("/api/admin/stats")
      if (res.status === 403) {
        toast.error("Admin access required")
        router.push("/tailor")
        return
      }
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load")
      setStats(await res.json())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load stats")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push("/tailor")
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f6f0]">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc4f33]" />
      </div>
    )
  }

  if (!stats) return null
  const { health } = stats
  const h = health.headlines
  const q = health.quality
  const f = health.features
  const v = health.volume
  const activity = health.activity
  const lastCohort = health.cohorts[health.cohorts.length - 1]

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/tailor"
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[#1e1813]/55 hover:text-[#1e1813]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1e1813]">
              Product health
            </h1>
            <p className="mt-1 text-[13px] text-[#1e1813]/55">
              Activation, retention, outcomes, quality, and volume — aggregates only.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/insights"
              className="rounded-lg border border-[#eee6da] bg-white px-3 py-2 text-[13px] text-[#1e1813]/70 hover:border-[#dc4f33]/40"
            >
              Insights & ops
            </Link>
            {isAdminEmail(user?.email) && (
              <Link
                href="/admin/courses"
                className="rounded-lg border border-[#eee6da] bg-white px-3 py-2 text-[13px] text-[#1e1813]/70 hover:border-[#dc4f33]/40"
              >
                Course review
              </Link>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1e1813] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#1e1813]/90 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Headlines */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="7-day activation"
            value={`${h.sevenDayActivation.rate}%`}
            sub={`${h.sevenDayActivation.activated} of ${h.sevenDayActivation.total} who signed up in the last 7 days tailored within 7d`}
            delta={lastCohort?.delta}
          />
          <Kpi
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Time to first tailor"
            value={h.timeToFirstTailorHours == null ? "—" : `${h.timeToFirstTailorHours}h`}
            sub="Median among users who activated in the last 30 days"
          />
          <Kpi
            icon={<Users className="h-3.5 w-3.5" />}
            label="Weekly active tailorers"
            value={String(h.weeklyActiveTailorers)}
            sub="Distinct users who tailored in the last 7 days"
          />
          <Kpi
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            label="30-day return rate"
            value={`${h.thirtyDayReturnRate.rate}%`}
            sub={`${h.thirtyDayReturnRate.returned} of ${h.thirtyDayReturnRate.activated} recent activators tailored on 2+ days`}
          />
        </div>

        <div className="space-y-5">
          <VolumeSection v={v} />
          <ActivitySection activity={activity} />

          <Section
            title="Weekly cohorts"
            meaning="Each week of signups: how many tailored within 7 days, returned, and started tracking. Compare week-over-week — not vanity volume."
          >
            <CohortChart cohorts={health.cohorts} />
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="Outcome funnel"
              meaning="Strict subsets. Each stage is contained in the one above it — conversions cannot exceed 100%."
            >
              <FunnelBars stages={health.outcomeFunnel} />
            </Section>

            <Section
              title="Quality"
              meaning="Last 30 days of tailor runs. Match score, feedback, edits, and cover-letter use."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-[#1e1813]/45">
                    Median match score
                  </p>
                  <p className="text-3xl font-semibold tabular-nums text-[#1e1813]">
                    {q.medianScore ?? "—"}
                  </p>
                  <p className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-[#1e1813]/45">
                    Score distribution
                  </p>
                  <ScoreBars buckets={q.scoreBuckets} total={q.runs} />
                </div>
                <div className="space-y-3 text-[13px]">
                  <div className="flex justify-between border-b border-[#eee6da] pb-2">
                    <span className="text-[#1e1813]/60">Feedback thumbs-up</span>
                    <span className="font-medium tabular-nums">
                      {q.feedbackRate == null ? "—" : `${q.feedbackRate}%`}
                      <span className="ml-1 font-normal text-[#1e1813]/40">
                        ({q.feedbackUp}/{q.feedbackUp + q.feedbackDown})
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#eee6da] pb-2">
                    <span className="text-[#1e1813]/60">Edited after tailor</span>
                    <span className="font-medium tabular-nums">{q.editRate}%</span>
                  </div>
                  <div className="flex justify-between border-b border-[#eee6da] pb-2">
                    <span className="text-[#1e1813]/60">Cover letter used</span>
                    <span className="font-medium tabular-nums">{q.coverLetterRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#1e1813]/60">Runs / activated user</span>
                    <span className="font-medium tabular-nums">
                      {q.runsPerActivated ?? "—"}
                      <span className="ml-1 font-normal text-[#1e1813]/40">
                        ({q.runs} runs)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <Section
            title="Feature adoption"
            meaning="All-time distinct users who touched each surface. Share is of all signed-up accounts."
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <AdoptionRow
                  label="Career Path"
                  count={f.careerPathUsers}
                  total={f.eligibleUsers}
                  hint="Has a roadmap row"
                />
                <AdoptionRow
                  label="North Star locked"
                  count={f.northStarLocked}
                  total={f.eligibleUsers}
                  hint="Target role set"
                />
                <AdoptionRow
                  label="Skills completed"
                  count={f.skillsCompleted}
                  unit="items marked done"
                  hint="Across all users"
                />
                <AdoptionRow
                  label="First CV started"
                  count={f.firstCvStarted}
                  total={f.eligibleUsers}
                />
              </div>
              <div>
                <AdoptionRow
                  label="Career Arc profile"
                  count={f.careerArcProfiles}
                  total={f.eligibleUsers}
                />
                <AdoptionRow
                  label="Career Arc shared"
                  count={f.careerArcShared}
                  total={f.eligibleUsers}
                  hint="Share links created"
                />
                <AdoptionRow
                  label="Evidence Bank"
                  count={f.evidenceUsers}
                  total={f.eligibleUsers}
                  hint="At least one evidence item"
                />
                <AdoptionRow
                  label="First CV ready"
                  count={f.firstCvCompleted}
                  total={f.eligibleUsers}
                />
              </div>
            </div>
          </Section>

          <Section
            title="Stuck segments"
            meaning="Where users stop. Emails shown for admin viewers — no CVs or job text."
          >
            <StuckList buckets={health.stuck} />
          </Section>

          {/* Confidence footer */}
          <footer className="rounded-xl border border-[#eee6da] bg-white p-5">
            <div className="mb-3 flex items-center gap-2 text-[#1e1813]">
              <ShieldCheck className="h-4 w-4 text-[#dc4f33]" />
              <h3 className="text-[13px] font-semibold uppercase tracking-wide">
                Confidence
              </h3>
            </div>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#1e1813]/60">
              {health.confidence.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
            {health.confidence.profilesVsAuth.profiles !==
              health.confidence.profilesVsAuth.authUsers && (
              <p className="mt-3 flex items-start gap-2 text-[12px] text-[#b3341b]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Auth users ({health.confidence.profilesVsAuth.authUsers}) ≠ profiles (
                {health.confidence.profilesVsAuth.profiles}). Prefer funnel stages that use
                the same source.
              </p>
            )}
            <p className="mt-3 text-[11px] tabular-nums text-[#1e1813]/40">
              Generated {new Date(stats.generatedAt).toLocaleString()} · env {stats.env} ·
              window {health.confidence.windowDays}d
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}
