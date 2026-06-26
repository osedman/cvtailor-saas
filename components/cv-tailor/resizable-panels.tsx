"use client"

import { useState, useRef, useCallback, useEffect, DragEvent, useId } from "react"
import { GripVertical, Upload, X, FileText, Link, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface ResizablePanelsProps {
  cvText: string
  setCvText: (text: string) => void
  jobDescription: string
  setJobDescription: (text: string) => void
  onJobUrlScraped?: (url: string) => void
  enhanced?: boolean
  /** Drives the onboarding coachmark badges on the panel headers. */
  guideStep?: "cv" | "job" | "tailor" | null
}

function CoachBadge({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
      <span className="relative flex h-5 w-5 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[#dc4f33] opacity-40 animate-ping" />
        <span className="relative inline-flex h-5 w-5 rounded-full bg-[#dc4f33] text-white text-[11px] font-extrabold items-center justify-center">{n}</span>
      </span>
      <span className="text-[11px] font-semibold text-[#dc4f33]">{label}</span>
    </span>
  )
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function WordCountBadge({ count }: { count: number }) {
  if (!count) return null

  const color = count >= 400
    ? "text-green-600 bg-green-50 border-green-200"
    : count >= 300
    ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-red-500 bg-red-50 border-red-200"

  const label = count >= 400 ? "Good length" : count >= 300 ? "A bit short" : "Too short"

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border font-medium ${color}`}>
      {count.toLocaleString()} words · {label}
    </span>
  )
}

export function ResizablePanels({
  cvText,
  setCvText,
  jobDescription,
  setJobDescription,
  onJobUrlScraped,
  enhanced = false,
  guideStep = null,
}: ResizablePanelsProps) {
  // Shared style fragments toggled by the enhanced (gated) workspace UI.
  const panelShell = enhanced
    ? "bg-white border border-[#ece6da] rounded-2xl shadow-[0_1px_2px_rgba(30,24,19,0.04),0_8px_24px_rgba(30,24,19,0.05)]"
    : "bg-gray-50/50 shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
  const panelHeaderBg = enhanced ? "bg-white border-b border-[#f0ebe1]" : "bg-gray-50/80 border-b border-gray-100"
  const panelFooterBg = enhanced ? "bg-[#faf8f3] border-t border-[#f0ebe1]" : "bg-gray-50/50 border-t border-gray-100"
  const labelCls = enhanced
    ? "text-[11px] font-bold uppercase tracking-[1px] text-[#dc4f33]"
    : "text-xs font-medium text-[#dc4f33]"
  const [leftWidth, setLeftWidth] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const [isDroppingCv, setIsDroppingCv] = useState(false)
  const [parsingFile, setParsing] = useState(false)
  const [jobUrl, setJobUrl] = useState("")
  const [scrapingUrl, setScrapingUrl] = useState(false)
  const [restoredFromStorage, setRestoredFromStorage] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputId = useId()

  // Restore CV from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cvtailor:cv")
      const savedName = localStorage.getItem("cvtailor:cv-filename")
      if (saved && !cvText) {
        setCvText(saved)
        if (savedName) setCvFileName(savedName)
        setRestoredFromStorage(true)
        setTimeout(() => setRestoredFromStorage(false), 4000)
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist CV to localStorage (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (cvText) {
          localStorage.setItem("cvtailor:cv", cvText)
        } else {
          localStorage.removeItem("cvtailor:cv")
          localStorage.removeItem("cvtailor:cv-filename")
        }
      } catch {}
    }, 800)
    return () => clearTimeout(t)
  }, [cvText])

  const handleMouseDown = useCallback(() => setIsDragging(true), [])
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setLeftWidth(Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100)))
  }, [isDragging])
  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  // Parse file (PDF or DOCX)
  const parseFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf' && ext !== 'docx') {
      toast.error("Only PDF and DOCX files are supported")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.")
      return
    }

    setParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/parse-cv', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCvText(data.text)
      setCvFileName(file.name)
      localStorage.setItem("cvtailor:cv-filename", file.name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file")
    } finally {
      setParsing(false)
    }
  }, [setCvText])

  const handleFileDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDroppingCv(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [parseFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ""
  }, [parseFile])

  const clearCv = useCallback(() => {
    setCvText("")
    setCvFileName(null)
    localStorage.removeItem("cvtailor:cv")
    localStorage.removeItem("cvtailor:cv-filename")
  }, [setCvText])

  // Scrape job URL
  const handleScrapeUrl = useCallback(async () => {
    if (!jobUrl.trim()) return
    setScrapingUrl(true)
    try {
      const res = await fetch('/api/scrape-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jobUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJobDescription(data.text)
      onJobUrlScraped?.(jobUrl.trim())
      setJobUrl("")
      toast.success("Job description fetched!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fetch URL")
    } finally {
      setScrapingUrl(false)
    }
  }, [jobUrl, setJobDescription])

  const words = wordCount(cvText)

  return (
    <div
      ref={containerRef}
      className="flex-1 flex relative select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Left Panel: CV ── */}
      <div className="flex flex-col p-4" style={{ width: `${leftWidth}%` }}>
        <div
          className={`relative flex-1 flex flex-col rounded-lg overflow-hidden transition-all duration-150 ${
            isDroppingCv
              ? "ring-2 ring-[#dc4f33] shadow-[inset_0_2px_12px_rgba(220,79,51,0.1)]"
              : panelShell
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDroppingCv(true) }}
          onDragLeave={() => setIsDroppingCv(false)}
          onDrop={handleFileDrop}
        >
          {/* Panel header */}
          <div className={`flex-shrink-0 flex items-center justify-between px-3 pt-2.5 pb-1.5 ${panelHeaderBg}`}>
            <div className="flex items-center gap-2">
              <span className={labelCls}>Your CV</span>
              {guideStep === "cv" && <CoachBadge n={1} label="Start here" />}
              {cvFileName && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                  <FileText className="w-2.5 h-2.5" />
                  {cvFileName}
                </span>
              )}
              {restoredFromStorage && (
                <span className="text-[10px] text-amber-500 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  Restored from last session
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {cvText && (
                <button onClick={clearCv} className="text-gray-300 hover:text-gray-500 transition-colors" title="Clear CV">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <label
                htmlFor={fileInputId}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:border-gray-300 hover:text-gray-700 transition-all ${parsingFile ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
              >
                {parsingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {parsingFile ? "Parsing…" : "Upload PDF / DOCX"}
              </label>
              <input
                id={fileInputId}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                disabled={parsingFile}
                onChange={handleFileInput}
              />
            </div>
          </div>

          {/* Body: drop zone when empty, textarea when populated */}
          {parsingFile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#dc4f33]" />
              <p className="text-sm">Reading your CV…</p>
            </div>
          ) : !cvText ? (
            <label
              htmlFor={fileInputId}
              className={`flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer m-2 rounded-lg border-2 border-dashed transition-all duration-150 group ${
                isDroppingCv
                  ? "border-[#dc4f33] bg-[#ffeae4]/40"
                  : "border-gray-200 hover:border-[#dc4f33] hover:bg-[#ffeae4]/20"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isDroppingCv ? "bg-[#dc4f33]/10" : "bg-gray-100 group-hover:bg-[#dc4f33]/10"}`}>
                <Upload className={`w-6 h-6 transition-colors ${isDroppingCv ? "text-[#dc4f33]" : "text-gray-400 group-hover:text-[#dc4f33]"}`} />
              </div>
              <div className="text-center px-4">
                <p className={`text-sm font-medium transition-colors ${isDroppingCv ? "text-[#dc4f33]" : "text-gray-500 group-hover:text-[#dc4f33]"}`}>
                  {isDroppingCv ? "Release to upload" : "Drop your CV here or click to browse"}
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF · DOCX · TXT supported</p>
              </div>
              <p className="text-xs text-gray-300">or paste your CV text below</p>
            </label>
          ) : (
            <textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              className="flex-1 w-full px-3 py-2 bg-transparent resize-none focus:outline-none font-mono text-sm text-[#1e1813] leading-relaxed placeholder:text-gray-300"
              placeholder="Your CV text…"
            />
          )}

          {/* Always-visible paste area when empty (below the drop zone) */}
          {!cvText && !parsingFile && (
            <textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              className="w-full h-20 px-3 py-2 bg-transparent resize-none focus:outline-none font-mono text-sm text-[#1e1813] leading-relaxed placeholder:text-gray-300 border-t border-gray-100"
              placeholder="…or paste your CV text here"
            />
          )}

          {/* Footer: word count */}
          <div className={`flex-shrink-0 flex items-center justify-between px-3 py-1.5 ${panelFooterBg}`}>
            {words > 0 ? (
              <WordCountBadge count={words} />
            ) : (
              <span className="text-[10px] text-gray-300">Ideal: 400–700 words</span>
            )}
            <span className="text-[10px] text-gray-400">{cvText.length.toLocaleString()} chars</span>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div
        className={`relative w-px cursor-col-resize group ${isDragging ? "bg-[#dc4f33]" : "bg-gray-200"}`}
        onMouseDown={handleMouseDown}
      >
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
          isDragging ? "bg-[#dc4f33] text-white" : "bg-white border border-gray-200 text-gray-400 group-hover:border-gray-300 group-hover:text-gray-500"
        }`}>
          <GripVertical className="w-4 h-4" />
        </div>
      </div>

      {/* ── Right Panel: Job Description ── */}
      <div className="flex flex-col p-4" style={{ width: `${100 - leftWidth}%` }}>
        <div className={`relative flex-1 flex flex-col rounded-lg overflow-hidden ${panelShell}`}>
          {/* Panel header */}
          <div className={`flex-shrink-0 px-3 pt-2.5 pb-1.5 ${panelHeaderBg}`}>
            <span className={labelCls}>Job Description</span>
            {guideStep === "job" && <CoachBadge n={2} label="Next" />}
          </div>

          {/* URL scraper bar */}
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-white/60">
            <Link className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScrapeUrl()}
              placeholder="Paste LinkedIn / Indeed URL to auto-fill…"
              className="flex-1 text-xs bg-transparent focus:outline-none text-[#1e1813] placeholder:text-gray-300 min-w-0"
            />
            {jobUrl && (
              <button
                onClick={handleScrapeUrl}
                disabled={scrapingUrl}
                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white bg-[#dc4f33] rounded hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
              >
                {scrapingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : "Fetch"}
              </button>
            )}
          </div>

          {/* Textarea */}
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="flex-1 w-full px-3 py-2 bg-transparent resize-none focus:outline-none text-sm text-[#1e1813] leading-relaxed placeholder:text-gray-300"
            placeholder="Or paste the job description here…"
          />

          {/* Footer */}
          <div className={`flex-shrink-0 flex items-center justify-end px-3 py-1.5 ${panelFooterBg}`}>
            <span className="text-[10px] text-gray-400">{jobDescription.length.toLocaleString()} chars</span>
          </div>
        </div>
      </div>
    </div>
  )
}
