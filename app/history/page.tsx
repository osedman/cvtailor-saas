"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Building2, ExternalLink, Trash2, Loader2,
  AlertCircle, CheckCircle, Clock, RefreshCw, Kanban, Plus, Download,
} from "lucide-react"
import { downloadWordDoc } from "@/lib/word"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"
import { ResultsTabs } from "@/components/cv-tailor/results-tabs"
import { JobTrackerBoard } from "@/components/tracker/job-tracker-board"
import type { TailorResult, InterviewPrepResult } from "@/lib/anthropic"

interface HistoryItem {
  id: string
  created_at: string
  job_title: string
  company_name: string
  job_url: string
  job_snippet: string
  job_description?: string
  match_score: number
  result: TailorResult
  original_cv?: string
}

// ── helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return "Today, " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" })
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
}

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626"
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={4.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4.5}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[13px] font-bold" style={{ color }}>{score}</span>
        <span className="text-[7px] text-gray-400 uppercase tracking-wide">match</span>
      </div>
    </div>
  )
}

function wordFilename(item: { job_title: string; company_name: string }) {
  const slug = [item.job_title, item.company_name]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `cv-${slug || "tailored"}.doc`
}

function MatchLabel({ score }: { score: number }) {
  const cfg = score >= 75
    ? { label: "Strong match", cls: "bg-green-50 text-green-700" }
    : score >= 50
    ? { label: "Moderate match", cls: "bg-amber-50 text-amber-700" }
    : { label: "Low match", cls: "bg-red-50 text-red-600" }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Card ───────────────────────────────────────────────────────────────

function HistoryCard({
  item,
  selected,
  onSelect,
  onDelete,
  deleting,
}: {
  item: HistoryItem
  selected: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  deleting: boolean
}) {
  const atsPass = item.result?.atsNotes?.status === "pass"
  const changesCount = item.result?.keyChanges?.length ?? 0
  const gapsCount = item.result?.gaps?.length ?? 0

  return (
    <article
      onClick={onSelect}
      className={`group relative flex flex-col rounded-xl border cursor-pointer transition-all duration-200 overflow-hidden
        ${selected
          ? "border-[#dc4f33] shadow-[0_0_0_3px_rgba(220,79,51,0.12)] bg-white"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
        }`}
    >
      {/* Top accent bar when selected */}
      {selected && (
        <div className="h-0.5 w-full bg-[#dc4f33]" />
      )}

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <ScoreRing score={item.match_score} />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[#1e1813] truncate leading-snug">
              {item.job_title || "Untitled role"}
            </h3>
            {item.company_name && (
              <div className="flex items-center gap-1 mt-1">
                <Building2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500 truncate">{item.company_name}</span>
              </div>
            )}
            <div className="mt-1.5">
              <MatchLabel score={item.match_score} />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* ATS */}
          <div className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full
            ${atsPass ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
            {atsPass
              ? <CheckCircle className="w-3 h-3" />
              : <AlertCircle className="w-3 h-3" />}
            {atsPass ? "ATS pass" : "ATS warning"}
          </div>

          {/* Changes */}
          <span className="text-[10px] text-gray-400">
            {changesCount} change{changesCount !== 1 ? "s" : ""}
          </span>

          {/* Gaps */}
          {gapsCount > 0 && (
            <span className="text-[10px] text-gray-400">
              {gapsCount} gap{gapsCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Snippet */}
        <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
          {item.job_snippet}
        </p>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between bg-gray-50/60">
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(item.created_at)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); downloadWordDoc(item.result?.tailoredCV ?? "", wordFilename(item)) }}
            className="p-1.5 rounded-lg text-gray-300 hover:text-[#dc4f33] hover:bg-[#ffeae4] transition-colors"
            title="Download tailored CV as Word"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {item.job_url && (
            <a
              href={item.job_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-gray-300 hover:text-[#dc4f33] hover:bg-[#ffeae4] transition-colors"
              title="Open original job posting"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            {deleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </article>
  )
}

// ── Empty state ────────────────────────────────────────────────────────

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
        <Clock className="w-7 h-7 text-gray-200" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">No tailored CVs yet</p>
        <p className="text-xs text-gray-300 mt-1">
          Every time you tailor your CV it will be saved here.
        </p>
      </div>
      <Link
        href="/tailor"
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] transition-colors"
      >
        Tailor your first CV
      </Link>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [view, setView] = useState<"cvs" | "tracker">("cvs")
  const [addingToTrackerId, setAddingToTrackerId] = useState<string | null>(null)

  // On-demand generations for the selected history item
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [loadingCoverLetter, setLoadingCoverLetter] = useState(false)
  const [prepQuestions, setPrepQuestions] = useState<InterviewPrepResult["interviewQuestions"] | null>(null)
  const [loadingPrep, setLoadingPrep] = useState(false)

  const selectedItem = history.find(h => h.id === selectedId) ?? null

  // Reset generated artefacts when switching items
  useEffect(() => {
    setCoverLetter(null)
    setPrepQuestions(null)
  }, [selectedId])

  // Inputs for re-generation: the stored original CV and the full JD
  // (older rows only kept a 200-char snippet, which still gives usable context)
  const genCv = selectedItem?.original_cv || selectedItem?.result?.tailoredCV || ""
  const genJd = selectedItem?.job_description || selectedItem?.job_snippet || ""
  const canGenerate = genCv.length > 0 && genJd.length > 0

  const handleGenerateCoverLetter = useCallback(async () => {
    if (!canGenerate) { toast.error("This run predates stored job details, so regeneration isn't available."); return }
    setLoadingCoverLetter(true)
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: genCv, jobDescription: genJd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setCoverLetter(data.coverLetter)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate cover letter.")
    } finally {
      setLoadingCoverLetter(false)
    }
  }, [canGenerate, genCv, genJd])

  const handleGeneratePrep = useCallback(async () => {
    if (!canGenerate) { toast.error("This run predates stored job details, so regeneration isn't available."); return }
    setLoadingPrep(true)
    try {
      const res = await fetch("/api/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: genCv, jobDescription: genJd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setPrepQuestions(data.interviewQuestions)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate interview prep.")
    } finally {
      setLoadingPrep(false)
    }
  }, [canGenerate, genCv, genJd])

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/history")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHistory(data.history)
      // Auto-select first item
      if (data.history.length > 0) setSelectedId(data.history[0].id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load history")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchHistory()
  }, [user, fetchHistory])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(id)
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed")
      setHistory(prev => {
        const next = prev.filter(h => h.id !== id)
        // If we deleted the selected item, select the next one
        if (selectedId === id) setSelectedId(next[0]?.id ?? null)
        return next
      })
      toast.success("Removed")
    } catch {
      toast.error("Could not delete")
    } finally {
      setDeletingId(null)
    }
  }, [selectedId])

  const handleAddToTracker = useCallback(async (item: HistoryItem) => {
    setAddingToTrackerId(item.id)
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "saved",
          job_title: item.job_title || item.result?.jobTitle || "Untitled role",
          company_name: item.company_name || item.result?.companyName || "",
          job_url: item.job_url || "",
          job_description: item.job_snippet || "",
          tailored_cv: item.result?.tailoredCV || "",
          match_score: item.match_score ?? null,
          history_id: item.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Added to tracker (Saved)", {
        action: { label: "View board", onClick: () => setView("tracker") },
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to tracker")
    } finally {
      setAddingToTrackerId(null)
    }
  }, [])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            href="/tailor"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1e1813] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="w-px h-4 bg-gray-200" />
          <h1 className="text-sm font-semibold text-[#1e1813]">Tailor history</h1>
          {history.length > 0 && (
            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
              {history.length}
            </span>
          )}

          {/* View switcher */}
          <div className="flex items-center gap-1 ml-4 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("cvs")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                view === "cvs" ? "bg-white text-[#1e1813] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Tailored CVs
            </button>
            <button
              onClick={() => setView("tracker")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                view === "tracker" ? "bg-white text-[#1e1813] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Job tracker
            </button>
          </div>

          <div className="flex-1" />
          {view === "cvs" && (
            <button
              onClick={fetchHistory}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#dc4f33] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          )}
        </div>
      </header>

      {view === "tracker" ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <JobTrackerBoard />
        </div>
      ) : history.length === 0 ? (
        <EmptyHistory />
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-6 items-start">

          {/* ── Left: card grid (independently scrollable on desktop) ── */}
          <div className="w-full lg:w-[380px] flex-shrink-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              {history.map(item => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onDelete={(e) => handleDelete(item.id, e)}
                  deleting={deletingId === item.id}
                />
              ))}
            </div>
          </div>

          {/* ── Right: detail panel ── */}
          {selectedItem && (
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Detail header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <ScoreRing score={selectedItem.match_score} size={56} />
                    <div>
                      <h2 className="text-base font-semibold text-[#1e1813]">
                        {selectedItem.job_title || "Untitled role"}
                      </h2>
                      {selectedItem.company_name && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm text-gray-500">{selectedItem.company_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <MatchLabel score={selectedItem.match_score} />
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{formatDate(selectedItem.created_at)}</span>
                        {selectedItem.job_url && (
                          <>
                            <span className="text-xs text-gray-300">·</span>
                            <a
                              href={selectedItem.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#dc4f33] hover:underline flex items-center gap-1"
                            >
                              View job posting
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => downloadWordDoc(selectedItem.result?.tailoredCV ?? "", wordFilename(selectedItem))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1e1813] bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      title="Download tailored CV as Word"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Word
                    </button>
                    <button
                      onClick={() => handleAddToTracker(selectedItem)}
                      disabled={addingToTrackerId === selectedItem.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
                      title="Add this job to the tracker's Saved column"
                    >
                      {addingToTrackerId === selectedItem.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Plus className="w-3.5 h-3.5" />}
                      Add to tracker
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="px-6 py-4">
                  <ResultsTabs
                    results={selectedItem.result}
                    coverLetter={coverLetter}
                    loadingCoverLetter={loadingCoverLetter}
                    onGenerateCoverLetter={handleGenerateCoverLetter}
                    prepQuestions={prepQuestions}
                    loadingPrep={loadingPrep}
                    onGeneratePrep={handleGeneratePrep}
                    originalCV={selectedItem.original_cv || null}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
