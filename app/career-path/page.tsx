"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Sparkles, Loader2, ExternalLink, Check, Circle, CircleDot, Target } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"

const ACCENT = "#dc4f33"

interface Roadmap {
  id: string
  target_role: string
  hours_per_week: number | null
  items: CareerRoadmapItem[]
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch {
    throw new Error(`The server returned an unexpected response (${res.status}). Please try again in a moment.`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error
    throw new Error(msg || `Server error ${res.status}. Please try again.`)
  }
  return data as T
}

const STATUS_CYCLE: Record<CareerItemStatus, CareerItemStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
}

function StatusIcon({ status }: { status: CareerItemStatus }) {
  if (status === "done") return <Check className="w-4 h-4 text-white" />
  if (status === "in_progress") return <CircleDot className="w-4 h-4 text-white" />
  return <Circle className="w-4 h-4 text-gray-300" />
}

function IntakeForm({ prefillSkills, onGenerated }: { prefillSkills: string[]; onGenerated: (r: Roadmap) => void }) {
  const [targetRole, setTargetRole] = useState("")
  const [hoursPerWeek, setHoursPerWeek] = useState("5")
  const [skillsText, setSkillsText] = useState(prefillSkills.join(", "))
  const [loading, setLoading] = useState(false)

  const submit = useCallback(async () => {
    const skills = skillsText.split(",").map((s) => s.trim()).filter(Boolean)
    if (skills.length === 0) {
      toast.error("Add at least one skill to build a roadmap around.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/career-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, hoursPerWeek: Number(hoursPerWeek) || null, skills }),
      })
      const data = await readJson<{ roadmap: Roadmap }>(res)
      onGenerated(data.roadmap)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your roadmap.")
    } finally {
      setLoading(false)
    }
  }, [targetRole, hoursPerWeek, skillsText, onGenerated])

  return (
    <div className="max-w-xl mx-auto py-16 px-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#fff7f4", color: ACCENT }}>
        <Target className="w-6 h-6" />
      </div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-[#1e1813]">Build your career path</h1>
      <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
        A few quick questions, then Tailr will find free resources and a project idea for each skill gap, so you
        can close it and show it on your CV.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">What role are you targeting?</label>
          <input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Senior Data Analyst"
            className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#dc4f33] placeholder:text-gray-300"
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">How many hours a week can you put in?</label>
          <select
            value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(e.target.value)}
            className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#dc4f33]"
          >
            <option value="2">Around 2 hours</option>
            <option value="5">Around 5 hours</option>
            <option value="10">Around 10 hours</option>
            <option value="20">20+ hours</option>
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">Skills to focus on</label>
          <input
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="e.g. SQL, stakeholder management"
            className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#dc4f33] placeholder:text-gray-300"
          />
          <p className="mt-1.5 text-[12px] text-gray-400">Comma-separated. Pre-filled from patterns in your tailor history where available.</p>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={loading}
        className="mt-8 w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white rounded-xl transition-all disabled:opacity-60"
        style={{ background: ACCENT }}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Building your roadmap…</> : <><Sparkles className="w-4 h-4" />Build my roadmap</>}
      </button>
      {loading && (
        <p className="mt-3 text-center text-[12px] text-gray-400">Searching for real, free resources — this can take up to a minute.</p>
      )}
    </div>
  )
}

function RoadmapView({ roadmap, onUpdated, onRebuild }: { roadmap: Roadmap; onUpdated: (r: Roadmap) => void; onRebuild: () => void }) {
  const [updating, setUpdating] = useState<string | null>(null)

  const cycleStatus = useCallback(async (item: CareerRoadmapItem) => {
    const nextStatus = STATUS_CYCLE[item.status]
    setUpdating(item.skill)
    try {
      const res = await fetch("/api/career-path", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: item.skill, status: nextStatus }),
      })
      const data = await readJson<{ roadmap: Roadmap }>(res)
      onUpdated(data.roadmap)
      if (nextStatus === "done") toast.success(`Nice — ${item.skill} marked done. Copy the CV bullet below into your CV.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.")
    } finally {
      setUpdating(null)
    }
  }, [onUpdated])

  const done = roadmap.items.filter((i) => i.status === "done").length

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Career path</p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-[#1e1813]">
            {roadmap.target_role || "Your roadmap"}
          </h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {done} of {roadmap.items.length} skills done{roadmap.hours_per_week ? ` · ~${roadmap.hours_per_week}h/week` : ""}
          </p>
        </div>
        <button
          onClick={onRebuild}
          className="text-[13px] font-medium text-gray-500 hover:text-[#1e1813] border border-gray-200 hover:border-gray-300 rounded-lg px-3.5 py-2 transition-colors"
        >
          Rebuild roadmap
        </button>
      </div>

      <div className="mt-8 space-y-4">
        {roadmap.items.map((item) => (
          <div key={item.skill} className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex items-start gap-3">
              <button
                onClick={() => cycleStatus(item)}
                disabled={updating === item.skill}
                className="flex-shrink-0 w-7 h-7 mt-0.5 rounded-full flex items-center justify-center transition-colors"
                style={{ background: item.status === "todo" ? "#f3f4f6" : ACCENT }}
                title="Click to change status"
              >
                {updating === item.skill ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <StatusIcon status={item.status} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-[16px] font-bold ${item.status === "done" ? "text-gray-400 line-through" : "text-[#1e1813]"}`}>{item.skill}</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{
                      background: item.status === "done" ? "#dcfce7" : item.status === "in_progress" ? "#ffeae4" : "#f3f4f6",
                      color: item.status === "done" ? "#16a34a" : item.status === "in_progress" ? ACCENT : "#9ca3af",
                    }}>
                    {item.status === "in_progress" ? "in progress" : item.status}
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] text-gray-500 leading-relaxed">{item.whyItMatters}</p>

                {item.resources?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.resources.map((r, i) => (
                      <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-600 hover:text-[#dc4f33] bg-gray-50 hover:bg-[#ffeae4] border border-gray-100 rounded-lg px-2.5 py-1.5 transition-colors">
                        <ExternalLink className="w-3 h-3" />
                        {r.title} <span className="text-gray-400">· {r.source}</span>
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-3 rounded-xl bg-gray-50/70 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Project idea</p>
                  <p className="text-[13px] text-gray-700 leading-relaxed">{item.projectBrief}</p>
                </div>

                {item.status === "done" && (
                  <div className="mt-3 rounded-xl border border-green-100 bg-green-50/60 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Add to your CV</p>
                    <p className="text-[13px] text-[#1e1813] leading-relaxed">{item.cvPhrasing}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CareerPathContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [roadmap, setRoadmap] = useState<Roadmap | null | undefined>(undefined) // undefined = loading
  const [rebuilding, setRebuilding] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    fetch("/api/career-path")
      .then((res) => readJson<{ roadmap: Roadmap | null }>(res))
      .then((data) => setRoadmap(data.roadmap))
      .catch(() => setRoadmap(null))
  }, [user])

  const prefillSkills = (searchParams.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean)

  if (authLoading || !user || roadmap === undefined) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <Header enhanced />
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link href="/tailor" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back to Tailr
        </Link>
      </div>
      {roadmap && !rebuilding ? (
        <RoadmapView roadmap={roadmap} onUpdated={setRoadmap} onRebuild={() => setRebuilding(true)} />
      ) : (
        <IntakeForm prefillSkills={roadmap ? roadmap.items.map((i) => i.skill) : prefillSkills} onGenerated={(r) => { setRoadmap(r); setRebuilding(false) }} />
      )}
    </div>
  )
}

export default function CareerPathPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>}>
      <CareerPathContent />
    </Suspense>
  )
}
