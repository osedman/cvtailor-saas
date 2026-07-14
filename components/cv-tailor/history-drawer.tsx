"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { X, Trash2, Clock, ChevronRight, Loader2, ExternalLink, Building2 } from "lucide-react"
import { toast } from "sonner"
import type { TailorResult, CareerRoadmapItem } from "@/lib/anthropic"

export interface HistoryItem {
  id: string
  created_at: string
  job_title: string
  company_name: string
  job_url: string
  job_snippet: string
  match_score: number
  result: TailorResult
  upskill?: CareerRoadmapItem[]
}

interface HistoryDrawerProps {
  open: boolean
  onClose: () => void
  onRestore?: (item: HistoryItem) => void  // kept for backwards compat, now unused
}

function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626"
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={3} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } else if (diffDays === 1) {
    return "Yesterday"
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" })
  } else {
    return d.toLocaleDateString([], { day: "numeric", month: "short" })
  }
}

export function HistoryDrawer({ open, onClose }: HistoryDrawerProps) {
  const router = useRouter()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/history")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHistory(data.history)
      setFetched(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load history")
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch when drawer opens (only once unless forced)
  useEffect(() => {
    if (open && !fetched) fetchHistory()
  }, [open, fetched, fetchHistory])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(id)
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      setHistory(prev => prev.filter(h => h.id !== id))
      toast.success("Removed from history")
    } catch {
      toast.error("Could not delete item")
    } finally {
      setDeletingId(null)
    }
  }, [])

  const handleNavigate = useCallback(() => {
    onClose()
    router.push("/history")
  }, [onClose, router])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-white border-l border-gray-100 shadow-xl z-50 flex flex-col transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#dc4f33]" />
            <span className="text-sm font-semibold text-[#1e1813]">Tailor history</span>
            {history.length > 0 && (
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                {history.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
              <Clock className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400 font-medium">No tailored CVs yet</p>
              <p className="text-xs text-gray-300">Every time you tailor your CV it&apos;ll appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {history.map((item) => (
                <li key={item.id}>
                  <div className="group relative">
                    {/* Main navigate button */}
                    <button
                      onClick={handleNavigate}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3"
                    >
                      {/* Score ring */}
                      <ScoreRing score={item.match_score} />

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-12">
                        {/* Job title */}
                        <p className="text-xs font-semibold text-[#1e1813] leading-snug truncate">
                          {item.job_title || item.result?.jobTitle || "Untitled role"}
                        </p>

                        {/* Company */}
                        {(item.company_name || item.result?.companyName) && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Building2 className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                            <span className="text-[10px] text-gray-500 truncate">
                              {item.company_name || item.result?.companyName}
                            </span>
                          </div>
                        )}

                        {/* Date + score label */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-300">
                            {formatDate(item.created_at)}
                          </span>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                            item.match_score >= 75 ? "bg-green-50 text-green-600" :
                            item.match_score >= 50 ? "bg-amber-50 text-amber-600" :
                            "bg-red-50 text-red-500"
                          }`}>
                            {item.match_score >= 75 ? "Strong match" :
                             item.match_score >= 50 ? "Moderate" : "Low match"}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="absolute right-10 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-200 group-hover:text-gray-400 transition-colors" />
                    </button>

                    {/* Action buttons (top-right corner) */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Open job URL */}
                      {item.job_url && (
                        <a
                          href={item.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded text-gray-300 hover:text-[#dc4f33] hover:bg-[#ffeae4] transition-colors"
                          title="Open original job posting"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {/* Delete */}
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                        title="Remove from history"
                      >
                        {deletingId === item.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="text-[11px] text-gray-400 hover:text-[#dc4f33] transition-colors flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Refresh
          </button>
          {history.length > 0 && (
            <button
              onClick={handleNavigate}
              className="text-[11px] font-medium text-[#dc4f33] hover:underline"
            >
              View all →
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
