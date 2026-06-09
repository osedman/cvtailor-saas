"use client"

import { useEffect, useState, useCallback } from "react"
import { X, Trash2, Clock, ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { TailorResult } from "@/lib/anthropic"

export interface HistoryItem {
  id: string
  created_at: string
  job_title: string
  job_snippet: string
  match_score: number
  result: TailorResult
}

interface HistoryDrawerProps {
  open: boolean
  onClose: () => void
  onRestore: (item: HistoryItem) => void
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

export function HistoryDrawer({ open, onClose, onRestore }: HistoryDrawerProps) {
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

  const handleRestore = useCallback((item: HistoryItem) => {
    onRestore(item)
    onClose()
  }, [onRestore, onClose])

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
            <Clock className="w-4 h-4 text-[#2563eb]" />
            <span className="text-sm font-semibold text-[#0f0f0f]">Tailor history</span>
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
                  <button
                    onClick={() => handleRestore(item)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors group flex items-start gap-3"
                  >
                    {/* Score ring */}
                    <ScoreRing score={item.match_score} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#0f0f0f] leading-snug truncate">
                        {item.job_title || "Untitled role"}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {item.job_snippet}
                      </p>
                      <span className="text-[10px] text-gray-300 mt-1 block">
                        {formatDate(item.created_at)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        disabled={deletingId === item.id}
                        className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                        title="Remove from history"
                      >
                        {deletingId === item.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />
                        }
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — refresh */}
        {fetched && (
          <div className="flex-shrink-0 border-t border-gray-100 px-4 py-2.5">
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="text-[11px] text-gray-400 hover:text-[#2563eb] transition-colors flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Refresh
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
