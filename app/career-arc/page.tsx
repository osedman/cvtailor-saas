"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Sparkles, TrendingUp, Briefcase, Star } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerProfileSections } from "@/lib/anthropic"

const ACCENT = "#dc4f33"

interface Profile {
  id: string
  source: string
  sections: CareerProfileSections
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

/** Fades a section in the first time it scrolls into view — no new dependency, mirrors the existing animate-fade-in-up utility */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function Reveal({ children }: { children: React.ReactNode }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={visible ? "animate-fade-in-up" : "opacity-0"}>
      {children}
    </div>
  )
}

/** Click-to-edit text — click to reveal an input/textarea, blur or Enter to save */
function EditableText({
  value,
  onSave,
  multiline = false,
  className = "",
  placeholder = "",
}: {
  value: string
  onSave: (next: string) => void
  multiline?: boolean
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== value.trim()) onSave(draft.trim())
  }

  if (editing) {
    const Field = multiline ? "textarea" : "input"
    return (
      <Field
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (!multiline && e.key === "Enter") commit() }}
        rows={multiline ? 3 : undefined}
        className={`${className} w-full bg-white border border-[#f5c9bb] rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-[#dc4f33]/15`}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`${className} text-left w-full rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-[#fff7f4] cursor-text`}
      title="Click to edit"
    >
      {value || <span className="text-gray-300">{placeholder}</span>}
    </button>
  )
}

function CVPasteForm({ onGenerated }: { onGenerated: (p: Profile) => void }) {
  const [cv, setCv] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = useCallback(async () => {
    if (!cv.trim()) {
      toast.error("Paste your CV first.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/career-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv }),
      })
      const data = await readJson<{ profile: Profile }>(res)
      onGenerated(data.profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your Career Arc.")
    } finally {
      setLoading(false)
    }
  }, [cv, onGenerated])

  return (
    <div className="max-w-xl mx-auto py-16 px-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shadow-sm" style={{ background: "#fff7f4", color: ACCENT }}>
        <TrendingUp className="w-6 h-6" />
      </div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-[#1e1813]">Build your Career Arc</h1>
      <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
        Paste your CV and Tailr will turn it into a highlight reel of your career — timeline, skills, growth, and the projects you should be proud of.
      </p>
      <textarea
        value={cv}
        onChange={(e) => setCv(e.target.value)}
        placeholder="Paste your CV text here…"
        rows={12}
        className="mt-6 w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300"
      />
      <button
        onClick={submit}
        disabled={loading}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
        style={{ background: ACCENT }}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Building your Career Arc…</> : <><Sparkles className="w-4 h-4" />Build my Career Arc</>}
      </button>
    </div>
  )
}

function CareerArcView({ profile, onUpdated }: { profile: Profile; onUpdated: (p: Profile) => void }) {
  const s = profile.sections

  const patch = useCallback(async (partial: Partial<CareerProfileSections>) => {
    try {
      const res = await fetch("/api/career-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: partial }),
      })
      const data = await readJson<{ profile: Profile }>(res)
      onUpdated(data.profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save your edit.")
    }
  }, [onUpdated])

  const hasGrowth = s.growth && (s.growth.fromTitle || s.growth.toTitle) && s.growth.fromTitle !== s.growth.toTitle

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-12">
      <Reveal>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Career Arc</p>
          <div className="mt-2">
            <EditableText
              value={s.headline}
              onSave={(next) => patch({ headline: next })}
              className="text-[26px] font-extrabold tracking-tight text-[#1e1813]"
            />
          </div>
        </div>
      </Reveal>

      {hasGrowth && (
        <Reveal>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 flex items-center justify-center gap-4 text-center">
            <span className="text-[15px] font-semibold text-gray-500">{s.growth.fromTitle}</span>
            <div className="flex-1 max-w-[120px] h-px bg-gradient-to-r from-gray-200 to-[#dc4f33]" />
            <TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT }} />
            <div className="flex-1 max-w-[120px] h-px bg-gradient-to-r from-[#dc4f33] to-gray-200" />
            <span className="text-[15px] font-semibold text-[#1e1813]">{s.growth.toTitle}</span>
            {typeof s.growth.tenureYears === "number" && s.growth.tenureYears > 0 && (
              <span className="text-[12px] text-gray-400 ml-2">· {s.growth.tenureYears}y</span>
            )}
          </div>
        </Reveal>
      )}

      {s.timeline?.length > 0 && (
        <Reveal>
          <div>
            <h2 className="text-sm font-semibold text-[#1e1813] mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4" style={{ color: ACCENT }} />Timeline</h2>
            <div className="relative pl-6 space-y-6 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-gray-100">
              {s.timeline.map((role, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: ACCENT }} />
                  <p className="text-[15px] font-bold text-[#1e1813]">{role.title} <span className="font-normal text-gray-400">· {role.company}</span></p>
                  <p className="text-[12px] text-gray-400 mb-1.5">{role.start} — {role.end}</p>
                  {role.highlights?.map((h, j) => (
                    <p key={j} className="text-[13.5px] text-gray-600 leading-relaxed">{h}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {s.skills?.length > 0 && (
        <Reveal>
          <div>
            <h2 className="text-sm font-semibold text-[#1e1813] mb-4">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {s.skills.map((sk, i) => (
                <span key={i} className="text-[12.5px] font-medium px-3 py-1.5 rounded-full bg-[#fff7f4] text-[#1e1813] border border-[#f5d9d0]">
                  {sk.name} <span className="text-gray-400">· {sk.category}</span>
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {s.projects?.length > 0 && (
        <Reveal>
          <div>
            <h2 className="text-sm font-semibold text-[#1e1813] mb-4">Key projects</h2>
            <div className="space-y-3">
              {s.projects.map((p, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5">
                  <p className="text-[15px] font-bold text-[#1e1813] mb-1">{p.title}</p>
                  <EditableText
                    value={p.summary}
                    multiline
                    onSave={(next) => {
                      const projects = s.projects.map((pr, j) => (j === i ? { ...pr, summary: next } : pr))
                      patch({ projects })
                    }}
                    className="text-[13.5px] text-gray-600 leading-relaxed"
                  />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {s.qualities?.length > 0 && (
        <Reveal>
          <div>
            <h2 className="text-sm font-semibold text-[#1e1813] mb-1.5 flex items-center gap-2"><Star className="w-4 h-4" style={{ color: ACCENT }} />What your career says about you</h2>
            <p className="text-[12px] text-gray-400 mb-4">Inferred from patterns across your CV — not a guarantee, just a signal.</p>
            <div className="flex flex-wrap gap-2">
              {s.qualities.map((q, i) => (
                <span key={i} className="text-[12.5px] font-medium px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
                  {q}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      )}
    </div>
  )
}

export default function CareerArcPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined) // undefined = loading
  const [needsCv, setNeedsCv] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  const autoGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/career-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const data = await readJson<{ profile: Profile }>(res)
      setProfile(data.profile)
    } catch (err) {
      if (err instanceof Error && /paste your CV/i.test(err.message)) {
        setNeedsCv(true)
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to build your Career Arc.")
        setNeedsCv(true)
      }
    } finally {
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    fetch("/api/career-profile")
      .then((res) => readJson<{ profile: Profile | null }>(res))
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile)
        } else {
          setProfile(null)
          autoGenerate()
        }
      })
      .catch(() => { setProfile(null); setNeedsCv(true) })
  }, [user, autoGenerate])

  if (authLoading || !user || profile === undefined) {
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

      {profile ? (
        <CareerArcView profile={profile} onUpdated={setProfile} />
      ) : generating ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          <p className="text-sm text-gray-400">Building your Career Arc…</p>
        </div>
      ) : needsCv ? (
        <CVPasteForm onGenerated={setProfile} />
      ) : (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}
    </div>
  )
}
