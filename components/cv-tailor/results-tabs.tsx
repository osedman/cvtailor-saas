"use client"

import { useState, useRef, useEffect } from "react"
import { Check, Download, AlertCircle, CheckCircle, Loader2, Sparkles } from "lucide-react"

import type { TailorResult, InterviewPrepResult, PitchesResult } from "@/lib/anthropic"
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
          return <p key={i} className="text-xs font-bold uppercase tracking-widest text-gray-500 pt-4 pb-1 border-b border-gray-100">{trimmed}</p>
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
}

const tabs = [
  "Tailored CV",
  "Cover Letter",
  "Interview Prep",
  "Key Changes",
  "Gaps",
  "Follow-ups",
  "ATS Notes",
] as const

type TabName = (typeof tabs)[number]

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
}: ResultsTabsProps) {
  // Interview Prep only appears where a generator is wired up (the tailor page).
  // There, Follow-ups live inside the prep tab; in the read-only history view
  // there's no prep tab, so Follow-ups stay as their own tab.
  const visibleTabs = onGeneratePrep
    ? tabs.filter((t) => t !== "Follow-ups")
    : tabs.filter((t) => t !== "Interview Prep")
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

  const handleDownloadWord = () => {
    // Word opens HTML wrapped in a .doc container natively — no library needed.
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const lines = (results.tailoredCV ?? "").split("\n")
    const body = lines
      .map((line) => {
        const t = line.trim()
        if (!t) return "<p>&nbsp;</p>"
        const isHeading = /^[A-Z][A-Z\s&/,]+$/.test(t)
        if (isHeading) return `<p style="font-weight:bold;font-size:13pt;margin:14pt 0 4pt">${esc(t)}</p>`
        if (/^[•\-\*·]/.test(t)) return `<p style="margin:0 0 0 18pt">• ${esc(t.replace(/^[•\-\*·]\s*/, ""))}</p>`
        return `<p style="margin:2pt 0">${esc(t)}</p>`
      })
      .join("\n")
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Tailored CV</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4">${body}</body></html>`
    const blob = new Blob(["﻿" + html], { type: "application/msword" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "tailored-cv.doc"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="animate-slide-up relative z-10 bg-white">
      {/* Tab bar */}
      <div className="relative border-b border-gray-100">
        <div className="flex gap-1 flex-wrap">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              ref={(el) => {
                if (el) tabRefs.current.set(tab, el)
              }}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm transition-colors duration-150 ${
                activeTab === tab
                  ? "text-[#1e1813] font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab}
            </button>
          ))}
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
                    <div key={i} className="p-4 bg-white rounded-lg shadow-sm border border-gray-100">
                      <span className="text-sm text-[#1e1813]">{question}</span>
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
