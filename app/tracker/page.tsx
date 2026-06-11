"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Plus, X, ExternalLink, Trash2, Loader2,
  Building2, Send, CheckCircle2, Briefcase, Trophy, Bookmark,
  ChevronDown,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"

// ── Types ──────────────────────────────────────────────────────────────

type Status = "saved" | "applied" | "interview" | "offer"

interface NoteEntry {
  text: string
  created_at: string
}

interface Job {
  id: string
  created_at: string
  updated_at: string
  status: Status
  position: number
  job_title: string
  company_name: string
  job_url: string
  job_description: string
  tailored_cv: string
  history_id: string | null
  match_score: number | null
  notes: NoteEntry[]
}

// ── Column config ──────────────────────────────────────────────────────

const COLUMNS: { id: Status; label: string; icon: React.ReactNode; color: string; bg: string; border: string }[] = [
  {
    id: "saved",
    label: "Saved",
    icon: <Bookmark className="w-3.5 h-3.5" />,
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
  },
  {
    id: "applied",
    label: "Applied",
    icon: <Send className="w-3.5 h-3.5" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    id: "interview",
    label: "Interview",
    icon: <Briefcase className="w-3.5 h-3.5" />,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  {
    id: "offer",
    label: "Offer",
    icon: <Trophy className="w-3.5 h-3.5" />,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
]

// ── Helpers ────────────────────────────────────────────────────────────

function relativeDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { day: "numeric", month: "short" })
}

function noteTime(iso: string) {
  return new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

// ── Add Job Modal ──────────────────────────────────────────────────────

function AddJobModal({
  initialStatus,
  onClose,
  onSave,
}: {
  initialStatus: Status
  onClose: () => void
  onSave: (job: Job) => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    job_title: "",
    company_name: "",
    job_url: "",
    job_description: "",
    tailored_cv: "",
    status: initialStatus,
  })

  const handleSave = async () => {
    if (!form.job_title.trim()) { toast.error("Job title is required"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSave(data.job)
      onClose()
      toast.success("Job added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[#0f0f0f]">Add job</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Job title *</label>
              <input
                value={form.job_title}
                onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
                placeholder="Senior Product Manager"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Company</label>
              <input
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
                placeholder="Acme Corp"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Status</label>
            <div className="flex gap-2 flex-wrap">
              {COLUMNS.map(col => (
                <button
                  key={col.id}
                  onClick={() => setForm(f => ({ ...f, status: col.id }))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                    ${form.status === col.id
                      ? `${col.bg} ${col.color} ${col.border}`
                      : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                    }`}
                >
                  {col.icon}{col.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Job URL</label>
            <input
              type="url"
              value={form.job_url}
              onChange={e => setForm(f => ({ ...f, job_url: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
              placeholder="https://linkedin.com/jobs/…"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Job description</label>
            <textarea
              value={form.job_description}
              onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))}
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 resize-none"
              placeholder="Paste the job description…"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Tailored CV</label>
            <textarea
              value={form.tailored_cv}
              onChange={e => setForm(f => ({ ...f, tailored_cv: e.target.value }))}
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 resize-none font-mono"
              placeholder="Paste your tailored CV for this role…"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-[#0f0f0f] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Add job
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Job Detail Sheet ───────────────────────────────────────────────────

type DetailTab = "overview" | "cv" | "notes"

function JobDetailSheet({
  job,
  onClose,
  onUpdate,
  onDelete,
}: {
  job: Job
  onClose: () => void
  onUpdate: (updated: Job) => void
  onDelete: (id: string) => void
}) {
  const [tab, setTab] = useState<DetailTab>("overview")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [addingNote, setAddingNote] = useState(false)
  const [local, setLocal] = useState<Job>(job)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync if parent job changes (e.g. status drag updated)
  useEffect(() => { setLocal(job) }, [job])

  const patch = useCallback(async (fields: Partial<Job>) => {
    const updated = { ...local, ...fields }
    setLocal(updated)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch(`/api/tracker/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        onUpdate(data.job)
      } catch {
        toast.error("Failed to save")
      } finally {
        setSaving(false)
      }
    }, 800)
  }, [local, job.id, onUpdate])

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setAddingNote(true)
    const entry: NoteEntry = { text: noteText.trim(), created_at: new Date().toISOString() }
    const newNotes = [...local.notes, entry]
    try {
      const res = await fetch(`/api/tracker/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: newNotes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLocal(data.job)
      onUpdate(data.job)
      setNoteText("")
    } catch {
      toast.error("Failed to save note")
    } finally {
      setAddingNote(false)
    }
  }

  const handleDeleteNote = async (idx: number) => {
    const newNotes = local.notes.filter((_, i) => i !== idx)
    const res = await fetch(`/api/tracker/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: newNotes }),
    })
    const data = await res.json()
    if (res.ok) { setLocal(data.job); onUpdate(data.job) }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${local.job_title}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tracker/${job.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed")
      onDelete(job.id)
      onClose()
      toast.success("Job deleted")
    } catch {
      toast.error("Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  const col = COLUMNS.find(c => c.id === local.status)!

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <aside className="fixed top-0 right-0 h-full w-full max-w-xl bg-white border-l border-gray-100 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <input
                value={local.job_title}
                onChange={e => patch({ job_title: e.target.value })}
                className="w-full text-base font-semibold text-[#0f0f0f] bg-transparent border-none outline-none placeholder:text-gray-300"
                placeholder="Job title"
              />
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-gray-400" />
                  <input
                    value={local.company_name}
                    onChange={e => patch({ company_name: e.target.value })}
                    className="text-xs text-gray-500 bg-transparent border-none outline-none placeholder:text-gray-300 w-32"
                    placeholder="Company"
                  />
                </div>
                {local.job_url && (
                  <a href={local.job_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[#2563eb] hover:underline">
                    <ExternalLink className="w-3 h-3" />View job
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />}
              <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Status picker */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {COLUMNS.map(c => (
              <button
                key={c.id}
                onClick={() => patch({ status: c.id })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all
                  ${local.status === c.id
                    ? `${c.bg} ${c.color} ${c.border}`
                    : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                  }`}
              >
                {c.icon}{c.label}
                {local.status === c.id && <CheckCircle2 className="w-3 h-3 ml-0.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex-shrink-0 flex border-b border-gray-100">
          {(["overview", "cv", "notes"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-xs font-medium capitalize transition-colors border-b-2 -mb-px
                ${tab === t ? "border-[#2563eb] text-[#0f0f0f]" : "border-transparent text-gray-400 hover:text-gray-600"}`}
            >
              {t === "notes" ? `Notes (${local.notes.length})` : t === "cv" ? "Tailored CV" : "Overview"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "overview" && (
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-2 uppercase tracking-wide">Job URL</label>
                <input
                  type="url"
                  value={local.job_url}
                  onChange={e => patch({ job_url: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb]"
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-2 uppercase tracking-wide">Job description</label>
                <textarea
                  value={local.job_description}
                  onChange={e => patch({ job_description: e.target.value })}
                  rows={14}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] resize-none leading-relaxed"
                  placeholder="Paste the job description…"
                />
              </div>
            </div>
          )}

          {tab === "cv" && (
            <div className="p-6">
              {local.match_score != null && (
                <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mb-4
                  ${local.match_score >= 75 ? "bg-green-50 text-green-700" : local.match_score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
                  {local.match_score}% match
                </div>
              )}
              <textarea
                value={local.tailored_cv}
                onChange={e => patch({ tailored_cv: e.target.value })}
                rows={24}
                className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] resize-none leading-relaxed"
                placeholder="Paste your tailored CV for this role…"
              />
            </div>
          )}

          {tab === "notes" && (
            <div className="flex flex-col h-full">
              {/* Existing notes */}
              <div className="flex-1 p-6 space-y-3 overflow-y-auto">
                {local.notes.length === 0 ? (
                  <p className="text-sm text-gray-300 text-center py-8">No notes yet — add one below.</p>
                ) : (
                  [...local.notes].reverse().map((n, i) => {
                    const realIdx = local.notes.length - 1 - i
                    return (
                      <div key={i} className="group bg-gray-50 rounded-xl p-4">
                        <p className="text-sm text-[#0f0f0f] leading-relaxed whitespace-pre-wrap">{n.text}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-gray-400">{noteTime(n.created_at)}</span>
                          <button
                            onClick={() => handleDeleteNote(realIdx)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Add note */}
              <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                  rows={3}
                  placeholder="Add a note… (⌘↵ to save)"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddNote}
                    disabled={addingNote || !noteText.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
                  >
                    {addingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[10px] text-gray-300">Added {relativeDate(job.created_at)}</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete job
          </button>
        </div>
      </aside>
    </>
  )
}

// ── Kanban Card ────────────────────────────────────────────────────────

function KanbanCard({
  job,
  onOpen,
  onDragStart,
}: {
  job: Job
  onOpen: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const col = COLUMNS.find(c => c.id === job.status)!

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300 hover:shadow-md active:shadow-sm transition-all duration-150 select-none group"
    >
      {/* Title + company */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0f0f0f] truncate">{job.job_title || "Untitled"}</p>
          {job.company_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">{job.company_name}</span>
            </div>
          )}
        </div>
        {job.job_url && (
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#2563eb] transition-all flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {job.match_score != null && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
            ${job.match_score >= 75 ? "bg-green-50 text-green-600" : job.match_score >= 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-500"}`}>
            {job.match_score}% match
          </span>
        )}
        {job.notes.length > 0 && (
          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">
            {job.notes.length} note{job.notes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <p className="text-[10px] text-gray-300 mt-2">{relativeDate(job.created_at)}</p>
    </div>
  )
}

// ── Kanban Column ──────────────────────────────────────────────────────

function KanbanColumn({
  col,
  jobs,
  onAddJob,
  onOpenJob,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  col: typeof COLUMNS[0]
  jobs: Job[]
  onAddJob: () => void
  onOpenJob: (job: Job) => void
  onDragStart: (e: React.DragEvent, jobId: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, status: Status) => void
  isDragOver: boolean
}) {
  return (
    <div className="flex flex-col flex-1 min-w-[240px] max-w-xs">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 ${col.bg} border ${col.border}`}>
        <div className={`flex items-center gap-2 text-xs font-semibold ${col.color}`}>
          {col.icon}
          {col.label}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/70`}>
            {jobs.length}
          </span>
        </div>
        <button
          onClick={onAddJob}
          className={`p-1 rounded-lg hover:bg-white/60 transition-colors ${col.color} opacity-70 hover:opacity-100`}
          title={`Add to ${col.label}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, col.id)}
        className={`flex-1 flex flex-col gap-2.5 rounded-xl p-2 min-h-[120px] transition-all duration-150
          ${isDragOver ? `ring-2 ring-[#2563eb] ring-offset-2 bg-blue-50/30` : "bg-transparent"}`}
      >
        {jobs.map(job => (
          <KanbanCard
            key={job.id}
            job={job}
            onOpen={() => onOpenJob(job)}
            onDragStart={(e) => onDragStart(e, job.id)}
          />
        ))}
        {jobs.length === 0 && (
          <div className={`flex-1 flex items-center justify-center rounded-xl border-2 border-dashed text-xs text-gray-300 py-8
            ${isDragOver ? "border-[#2563eb] text-[#2563eb]" : "border-gray-100"} transition-colors`}>
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [addingForStatus, setAddingForStatus] = useState<Status | null>(null)
  const [openJob, setOpenJob] = useState<Job | null>(null)
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null)
  const dragJobId = useRef<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetch("/api/tracker")
      .then(r => r.json())
      .then(d => setJobs(d.jobs ?? []))
      .catch(() => toast.error("Failed to load tracker"))
      .finally(() => setLoading(false))
  }, [user])

  const jobsByStatus = useCallback((status: Status) =>
    jobs.filter(j => j.status === status).sort((a, b) => a.position - b.position),
  [jobs])

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    dragJobId.current = jobId
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = async (e: React.DragEvent, newStatus: Status) => {
    e.preventDefault()
    setDragOverCol(null)
    const id = dragJobId.current
    if (!id) return
    const job = jobs.find(j => j.id === id)
    if (!job || job.status === newStatus) return

    // Optimistic update
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j))
    if (openJob?.id === id) setOpenJob(prev => prev ? { ...prev, status: newStatus } : null)

    try {
      const res = await fetch(`/api/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJobs(prev => prev.map(j => j.id === id ? data.job : j))
    } catch {
      // Revert
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: job.status } : j))
      toast.error("Failed to move job")
    }
  }

  const handleUpdate = useCallback((updated: Job) => {
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    setOpenJob(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id))
  }, [])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/40 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/tailor" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#0f0f0f] transition-colors">
            <ArrowLeft className="w-4 h-4" />Back
          </Link>
          <div className="w-px h-4 bg-gray-200" />
          <h1 className="text-sm font-semibold text-[#0f0f0f]">Job tracker</h1>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 font-medium">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setAddingForStatus("saved")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] transition-colors"
          >
            <Plus className="w-4 h-4" />Add job
          </button>
        </div>
      </header>

      {/* Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 min-h-full" style={{ minWidth: "fit-content" }}>
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              jobs={jobsByStatus(col.id)}
              onAddJob={() => setAddingForStatus(col.id)}
              onOpenJob={setOpenJob}
              onDragStart={handleDragStart}
              onDragOver={(e) => { handleDragOver(e); setDragOverCol(col.id) }}
              onDrop={handleDrop}
              isDragOver={dragOverCol === col.id}
            />
          ))}
        </div>
      </div>

      {/* Add job modal */}
      {addingForStatus && (
        <AddJobModal
          initialStatus={addingForStatus}
          onClose={() => setAddingForStatus(null)}
          onSave={(job) => setJobs(prev => [...prev, job])}
        />
      )}

      {/* Job detail sheet */}
      {openJob && (
        <JobDetailSheet
          job={openJob}
          onClose={() => setOpenJob(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
