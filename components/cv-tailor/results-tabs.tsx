"use client"

import { useState, useRef, useEffect } from "react"
import { Check, Download, AlertCircle, CheckCircle, Loader2, Sparkles, ThumbsUp, ThumbsDown, Building2, FileText, GitCompare, Mail, MessagesSquare, ListChecks, Pencil, GraduationCap, CircleDot, ArrowRight, ExternalLink, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import type { TailorResult, InterviewPrepResult, PitchesResult, CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"
import { downloadWordDoc } from "@/lib/word"
import { InterviewPrep } from "./interview-prep"
import { InterviewPitches } from "./interview-pitches"

/** Renders plain-text CV with visual hierarchy: bold section headers, indented bullets */
function FormattedCV({ text }: { text: string }) {
  const lines = (text ?? "").split("\n")
  return (
    <div className="font-mono text-sm text-[#1e1813] leading-relaxed space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-3" />

        // ALL-CAPS lines or lines ending with colon → section heading
        const isHeading = /^[A-Z][A-Z\s&/,]+$/.test(trimmed) || /^[A-Z][A-Z\s&/,]+(:|–)/.test(trimmed)
        // Bullet lines
        const isBullet = /^[•\-\*·]/.test(trimmed)
        // Name line (first non-empty line) — larger
        const isFirst = lines.slice(0, i).every(l => !l.trim()) && i < 5

        if (isFirst && !isBullet) {
          return <p key={i} className="text-base font-bold text-[#1e1813] tracking-tight">{trimmed}</p>
        }
        if (isHeading) {
          return <p key={i} className="text-sm font-bold uppercase tracking-widest text-[#dc4f33] pt-5 pb-1.5 mb-1 border-b-2 border-[#dc4f33]/30">{trimmed}</p>
        }
        if (isBullet) {
          return (
            <p key={i} className="pl-4 text-gray-700">
              <span className="text-[#dc4f33] mr-2">•</span>
              {trimmed.replace(/^[•\-\*·]\s*/, "")}
            </p>
          )
        }
        // Role/company line — slightly bolder
        if (/\d{4}/.test(trimmed) && trimmed.length < 120) {
          return <p key={i} className="font-medium text-[#1e1813]">{trimmed}</p>
        }
        return <p key={i} className="text-gray-700">{line}</p>
      })}
    </div>
  )
}

type CompanyAnalysisBlock = { type: "heading" | "bullet" | "text"; text: string }

/**
 * Groups the company-analysis plain text into heading/bullet/text blocks.
 * The model sometimes puts a bullet marker on its own line with the sentence
 * on the next line, or wraps a long bullet across several lines — a naive
 * one-line-per-block split renders those as a floating bullet dot with no
 * text, followed by an un-bulleted paragraph. Continuation lines (no marker,
 * no heading) are appended to the block that's still open instead.
 */
function parseCompanyAnalysis(raw: string): CompanyAnalysisBlock[] {
  const blocks: CompanyAnalysisBlock[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    if (/^[A-Z][A-Z\s&'?]+$/.test(t)) {
      blocks.push({ type: "heading", text: t })
      continue
    }
    const isMarker = /^[-•]/.test(t)
    const content = isMarker ? t.replace(/^[-•]\s*/, "").trim() : t
    const prev = blocks[blocks.length - 1]
    if (isMarker || !prev || prev.type === "heading") {
      blocks.push({ type: isMarker ? "bullet" : "text", text: content })
    } else {
      prev.text = prev.text ? `${prev.text} ${content}` : content
    }
  }
  return blocks
}

/** Thumbs up/down on a tailoring run, persisted to tailor_history.feedback */
function FeedbackBar({ historyId }: { historyId: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null)
  const [comment, setComment] = useState("")
  const [showComment, setShowComment] = useState(false)
  const [sent, setSent] = useState(false)

  const send = async (r: "up" | "down", c: string) => {
    try {
      const res = await fetch(`/api/history/${historyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: { rating: r, comment: c } }),
      })
      if (!res.ok) throw new Error()
      setSent(true)
      toast.success("Thanks — this helps improve the tailoring")
    } catch {
      toast.error("Could not save feedback")
    }
  }

  if (sent) {
    return (
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Check className="w-3.5 h-3.5 text-green-500" />Feedback saved
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">Was this tailoring good?</span>
        <button
          onClick={() => { setRating("up"); send("up", "") }}
          className={`p-1.5 rounded-lg transition-colors ${rating === "up" ? "bg-green-50 text-green-600" : "text-gray-300 hover:text-green-500 hover:bg-green-50"}`}
          title="Good result"
        >
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setRating("down"); setShowComment(true) }}
          className={`p-1.5 rounded-lg transition-colors ${rating === "down" ? "bg-red-50 text-red-500" : "text-gray-300 hover:text-red-400 hover:bg-red-50"}`}
          title="Needs work"
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
      </div>
      {showComment && (
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send("down", comment)}
            placeholder="What was wrong? (optional)"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#dc4f33]"
          />
          <button
            onClick={() => send("down", comment)}
            className="text-xs font-medium text-white bg-[#dc4f33] rounded-lg px-3 py-1.5 hover:bg-[#b3341b] transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}

interface ResultsTabsProps {
  results: TailorResult
  coverLetter: string | null
  loadingCoverLetter: boolean
  onGenerateCoverLetter: () => void
  prepQuestions?: InterviewPrepResult["interviewQuestions"] | null
  loadingPrep?: boolean
  onGeneratePrep?: () => void
  pitches?: PitchesResult["interviewPitches"] | null
  loadingPitches?: boolean
  onGeneratePitches?: () => void
  /** Original CV text — enables the side-by-side Compare tab */
  originalCV?: string | null
  /** Company analysis — enables the Company tab */
  companyAnalysis?: string | null
  loadingCompany?: boolean
  onGenerateCompany?: () => void
  /** tailor_history row id — enables the feedback bar */
  historyId?: string | null
  /** Upskill: per-application plan to close this run's gaps */
  upskill?: CareerRoadmapItem[] | null
  loadingUpskill?: boolean
  onGenerateUpskill?: () => void
  onUpdateUpskillItem?: (skill: string, status: CareerItemStatus) => void
  /** Enhanced (gated) workspace styling */
  enhanced?: boolean
}

const tabs = [
  "Tailored CV",
  "Compare",
  "Cover Letter",
  "Interview Prep",
  "Company",
  "Key Changes",
  "Gaps",
  "Upskill",
  "Follow-ups",
  "ATS Notes",
] as const

type TabName = (typeof tabs)[number]

const TAB_ICONS: Record<TabName, LucideIcon> = {
  "Tailored CV": FileText,
  "Compare": GitCompare,
  "Cover Letter": Mail,
  "Interview Prep": MessagesSquare,
  "Company": Building2,
  "Key Changes": Pencil,
  "Gaps": ListChecks,
  "Upskill": GraduationCap,
  "Follow-ups": MessagesSquare,
  "ATS Notes": CheckCircle,
}

export function ResultsTabs({
  results,
  coverLetter,
  loadingCoverLetter,
  onGenerateCoverLetter,
  prepQuestions = null,
  loadingPrep = false,
  onGeneratePrep,
  pitches = null,
  loadingPitches = false,
  onGeneratePitches,
  originalCV = null,
  companyAnalysis = null,
  loadingCompany = false,
  onGenerateCompany,
  historyId = null,
  upskill = null,
  loadingUpskill = false,
  onGenerateUpskill,
  onUpdateUpskillItem,
  enhanced = false,
}: ResultsTabsProps) {
  // Interview Prep only appears where a generator is wired up (the tailor page).
  // There, Follow-ups live inside the prep tab; in the read-only history view
  // there's no prep tab, so Follow-ups stay as their own tab.
  const visibleTabs = tabs.filter((t) => {
    if (t === "Follow-ups") return !onGeneratePrep
    if (t === "Interview Prep") return !!onGeneratePrep
    if (t === "Compare") return !!originalCV
    if (t === "Company") return !!onGenerateCompany
    return true
  })
  const [activeTab, setActiveTab] = useState<TabName>("Tailored CV")
  const [copied, setCopied] = useState(false)
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const tabRefs = useRef<Map<TabName, HTMLButtonElement>>(new Map())

  useEffect(() => {
    const activeButton = tabRefs.current.get(activeTab)
    if (activeButton) {
      setUnderlineStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }
  }, [activeTab])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(results.tailoredCV)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([results.tailoredCV], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "tailored-cv.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadWord = () => downloadWordDoc(results.tailoredCV)

  return (
    <div className="animate-slide-up relative z-10 bg-white">
      {/* Tab bar */}
      <div className="relative border-b border-gray-100">
        <div className="flex gap-1 flex-wrap">
          {visibleTabs.map((tab) => {
            const Icon = TAB_ICONS[tab]
            return (
              <button
                key={tab}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab, el)
                }}
                onClick={() => setActiveTab(tab)}
                className={`inline-flex items-center gap-1.5 px-4 py-3 text-sm transition-colors duration-150 ${
                  activeTab === tab
                    ? "text-[#1e1813] font-medium"
                    : enhanced ? "text-gray-400 hover:text-[#dc4f33]" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {enhanced && <Icon className="w-4 h-4" />}
                {tab}
              </button>
            )
          })}
        </div>
        {/* Animated underline */}
        <div
          className="absolute bottom-0 h-0.5 bg-[#dc4f33] transition-all duration-150 ease-out"
          style={{
            left: underlineStyle.left,
            width: underlineStyle.width,
          }}
        />
      </div>

      {/* Tab content */}
      <div className="mt-6 animate-fade-in-up">
        {activeTab === "Cover Letter" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            {coverLetter ? (
              <>
                <div className="flex justify-end gap-3 mb-4">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(coverLetter)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-150 ${
                      copied ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {copied ? <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Copied</span> : "Copy"}
                  </button>
                </div>
                <div className="prose prose-sm max-w-none leading-relaxed whitespace-pre-wrap text-[#1e1813]">
                  {coverLetter}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <p className="text-sm text-gray-500">Generate a tailored cover letter based on your CV and this role.</p>
                <button
                  onClick={onGenerateCoverLetter}
                  disabled={loadingCoverLetter}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
                >
                  {loadingCoverLetter ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Cover Letter</>}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "Interview Prep" && (
          <div>
            <InterviewPrep
              questions={prepQuestions}
              loading={loadingPrep}
              onGenerate={onGeneratePrep ?? (() => {})}
              embedded
            />

            {/* Follow-up questions from the core tailoring analysis */}
            {(results.followUps ?? []).length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-[#1e1813] mb-3">Quick follow-ups to prepare for</h3>
                <div className="space-y-3">
                  {(results.followUps ?? []).map((question, i) => (
                    <div key={i} className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-sm font-medium text-[#1e1813] leading-snug">{question}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STAR pitches live here too — the one place for interview prep */}
            {onGeneratePitches && (
              <InterviewPitches
                pitches={pitches}
                loading={loadingPitches}
                onGenerate={onGeneratePitches}
              />
            )}
          </div>
        )}

        {activeTab === "Tailored CV" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex justify-end gap-3 mb-4">
              <button
                onClick={handleCopy}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-150 ${
                  copied ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {copied ? <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Copied</span> : "Copy"}
              </button>
            </div>
            <FormattedCV text={results.tailoredCV} />
            <div className="mt-6 flex items-center gap-5">
              <button
                onClick={handleDownloadWord}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#dc4f33] hover:text-[#b3341b] transition-colors duration-150"
              >
                <Download className="w-3.5 h-3.5" />
                Download as Word
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors duration-150"
              >
                <Download className="w-3.5 h-3.5" />
                Download as .txt
              </button>
            </div>

            {historyId && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <FeedbackBar historyId={historyId} />
              </div>
            )}
          </div>
        )}

        {activeTab === "Compare" && originalCV && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-50/60 rounded-lg border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-500">Original</h3>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto">
                <FormattedCV text={originalCV} />
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#ffd8cd] shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#ffd8cd] bg-[#ffeae4]">
                <h3 className="text-xs font-semibold text-[#dc4f33]">Tailored</h3>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto">
                <FormattedCV text={results.tailoredCV} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "Company" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            {companyAnalysis ? (
              <div className="space-y-1">
                {parseCompanyAnalysis(companyAnalysis).map((block, i) => {
                  if (block.type === "heading") {
                    return <p key={i} className="text-xs font-bold uppercase tracking-widest text-[#dc4f33] pt-4 pb-1">{block.text}</p>
                  }
                  if (block.type === "bullet") {
                    return (
                      <p key={i} className="text-sm text-gray-600 leading-relaxed pl-4">
                        <span className="text-[#dc4f33] mr-2">•</span>
                        {block.text}
                      </p>
                    )
                  }
                  return <p key={i} className="text-sm text-gray-500 leading-relaxed">{block.text}</p>
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <div className="p-2 bg-[#ffeae4] rounded-xl">
                  <Building2 className="w-5 h-5 text-[#dc4f33]" />
                </div>
                <p className="text-sm text-gray-500 text-center max-w-sm">
                  Research {results.companyName || "the company"} — what they do, recent
                  developments, culture, and smart questions to ask in the interview.
                </p>
                <button
                  onClick={onGenerateCompany}
                  disabled={loadingCompany}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
                >
                  {loadingCompany
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Researching…</>
                    : <><Sparkles className="w-4 h-4" />Analyse Company</>}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "Key Changes" && (
          <div className="space-y-3">
            {(results.keyChanges ?? []).map((change, i) => (
              <div
                key={i}
                className="p-4 bg-white rounded-lg shadow-sm border border-gray-100 flex items-start gap-3"
              >
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${
                    change.type === "improved"
                      ? "bg-green-50 text-green-600"
                      : change.type === "reordered"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {change.type.charAt(0).toUpperCase() + change.type.slice(1)}
                </span>
                <span className="text-sm text-[#1e1813]">{change.text}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "Gaps" && (
          <div className="space-y-6">
            {/* Requirements coverage — how the match score was computed */}
            {(results.requirementsCoverage ?? []).length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-[#1e1813]">Requirements coverage</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Your match score is computed from this mapping</p>
                </div>
                <ul className="divide-y divide-gray-50">
                  {(results.requirementsCoverage ?? []).map((r, i) => {
                    const cfg = {
                      strong:       { label: "Strong",       cls: "bg-green-50 text-green-600" },
                      transferable: { label: "Transferable", cls: "bg-[#ffeae4] text-[#dc4f33]" },
                      partial:      { label: "Partial",      cls: "bg-amber-50 text-amber-600" },
                      none:         { label: "Missing",      cls: "bg-red-50 text-red-500" },
                    }[r.strength] ?? { label: r.strength, cls: "bg-gray-100 text-gray-500" }
                    return (
                      <li key={i} className="px-4 py-2.5 flex items-start gap-3">
                        <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-[#1e1813] leading-snug">
                            {r.requirement}
                            {r.type === "must" && (
                              <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">must-have</span>
                            )}
                          </p>
                          {r.evidence && (
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">↳ {r.evidence}</p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Gap advice */}
            <div className="space-y-3">
              {(results.gaps ?? []).map((gap, i) => (
                <div
                  key={i}
                  className="p-4 bg-gray-50 rounded-lg flex items-start gap-3"
                >
                  <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-600">{gap}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Upskill" && (() => {
          const ACCENT = "#dc4f33"
          const weak = (results.requirementsCoverage ?? []).filter((r) => r.strength === "partial" || r.strength === "none")
          const plan = upskill ?? []
          const STATUS_NEXT: Record<CareerItemStatus, CareerItemStatus> = { todo: "in_progress", in_progress: "done", done: "todo" }

          if (plan.length === 0) {
            return (
              <div className="space-y-5">
                <div className="rounded-xl border border-[#f5d9d0] bg-[#fff7f4] p-4">
                  <p className="text-[13.5px] leading-relaxed text-[#1e1813]">
                    <span className="font-semibold">Close the gaps for this job.</span> Turn the weak spots below into a plan — free resources, a project to prove each skill, and the exact CV line — to raise your match for {results.jobTitle || "this role"}.
                  </p>
                </div>
                {weak.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {weak.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-2.5 py-1.5 bg-gray-50 border border-gray-100 text-gray-600">
                        <AlertCircle className="w-3 h-3 text-[#dc4f33]" /> {r.requirement}
                      </span>
                    ))}
                  </div>
                )}
                {weak.length === 0 ? (
                  <p className="text-[13px] text-gray-500">No gaps flagged on this run — your CV already covers what this job asks for.</p>
                ) : historyId ? (
                  <div>
                    <button
                      onClick={onGenerateUpskill}
                      disabled={loadingUpskill}
                      className="inline-flex items-center gap-2 py-3 px-5 text-[14px] font-semibold text-white rounded-xl shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                      style={{ background: ACCENT }}
                    >
                      {loadingUpskill ? <><Loader2 className="w-4 h-4 animate-spin" />Finding resources…</> : <><Sparkles className="w-4 h-4" />Suggest how to close these</>}
                    </button>
                    {loadingUpskill && <p className="mt-2.5 text-[12px] text-gray-400">Searching for real, free resources — this can take up to a minute.</p>}
                  </div>
                ) : (
                  <p className="text-[13px] text-gray-400">Run a tailor while signed in to build an upskill plan.</p>
                )}
              </div>
            )
          }

          const done = plan.filter((i) => i.status === "done").length
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-gray-500">{done} of {plan.length} closed</p>
                <button onClick={onGenerateUpskill} disabled={loadingUpskill} className="text-[12px] font-medium text-gray-500 hover:text-[#1e1813] border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
                  {loadingUpskill ? "Rebuilding…" : "Rebuild"}
                </button>
              </div>
              <div className="space-y-3">
                {plan.map((item) => {
                  const isDone = item.status === "done"
                  const isActive = item.status === "in_progress"
                  return (
                    <div key={item.skill} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => onUpdateUpskillItem?.(item.skill, STATUS_NEXT[item.status])}
                          className="flex-shrink-0 w-7 h-7 mt-0.5 rounded-full flex items-center justify-center transition-all active:scale-90"
                          style={isDone ? { background: "#16a34a" } : isActive ? { background: ACCENT } : { background: "#fff", border: `1.5px dashed ${ACCENT}66` }}
                          title={isDone ? "Mark as to do" : isActive ? "Mark as done" : "Start this skill"}
                        >
                          {isDone ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.75} /> : isActive ? <CircleDot className="w-3.5 h-3.5 text-white" /> : <ArrowRight className="w-3 h-3" style={{ color: ACCENT }} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`text-[15px] font-bold ${isDone ? "text-gray-400 line-through" : "text-[#1e1813]"}`}>{item.skill}</h4>
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: isDone ? "#dcfce7" : "#fff7f4", color: isDone ? "#16a34a" : ACCENT }}>
                              {isActive ? "in progress" : isDone ? "done" : "not started"}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] text-gray-600 leading-relaxed">{item.whyItMatters}</p>
                          {item.resources?.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {item.resources.map((r, i) => (
                                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-[#dc4f33] bg-gray-50 hover:bg-[#ffeae4] border border-gray-100 rounded-lg px-2.5 py-1.5 transition-colors">
                                  <ExternalLink className="w-3 h-3" />{r.title} <span className="text-gray-400">· {r.source}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="mt-2.5 rounded-xl bg-gray-50/70 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Project idea</p>
                            <p className="text-[12.5px] text-gray-700 leading-relaxed">{item.projectBrief}</p>
                          </div>
                          {isDone && (
                            <div className="mt-2.5 rounded-xl border border-green-100 bg-green-50/60 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Add to your CV</p>
                              <p className="text-[12.5px] text-[#1e1813] leading-relaxed">{item.cvPhrasing}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[12px] text-gray-400 text-center">Close a gap, then re-tailor this job to see your match rise.</p>
            </div>
          )
        })()}

        {activeTab === "Follow-ups" && (
          <div className="space-y-3">
            {(results.followUps ?? []).map((question, i) => (
              <div
                key={i}
                className="p-4 bg-white rounded-lg shadow-sm border border-gray-100"
              >
                <span className="text-sm text-[#1e1813]">{question}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "ATS Notes" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              {(results.atsNotes?.status ?? "pass") === "pass" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-600 text-sm font-medium rounded-lg">
                  <CheckCircle className="w-4 h-4" />
                  ATS Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-600 text-sm font-medium rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  Needs Attention
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {(results.atsNotes?.items ?? []).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-gray-300 mt-1">•</span>
                  {item}
                </li>
              ))}
            </ul>

            {/* Deterministic keyword coverage */}
            {results.keywordCoverage && (results.keywordCoverage.present.length + results.keywordCoverage.missing.length) > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-[#1e1813] mb-2">JD keyword coverage</h3>
                <div className="flex flex-wrap gap-1.5">
                  {results.keywordCoverage.present.map((k, i) => (
                    <span key={`p${i}`} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                      <CheckCircle className="w-3 h-3" />{k}
                    </span>
                  ))}
                  {results.keywordCoverage.missing.map((k, i) => (
                    <span key={`m${i}`} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                      <AlertCircle className="w-3 h-3" />{k}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  Checked directly against the tailored CV text — green is present, red is worth weaving in if you can support it.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
