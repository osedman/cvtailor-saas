"use client"

import { useState, useRef, useEffect } from "react"
import { Check, Download, AlertCircle, CheckCircle, Loader2, Sparkles } from "lucide-react"

import type { TailorResult } from "@/lib/anthropic"

/** Renders plain-text CV with visual hierarchy: bold section headers, indented bullets */
function FormattedCV({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <div className="font-mono text-sm text-[#0f0f0f] leading-relaxed space-y-0.5">
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
          return <p key={i} className="text-base font-bold text-[#0f0f0f] tracking-tight">{trimmed}</p>
        }
        if (isHeading) {
          return <p key={i} className="text-xs font-bold uppercase tracking-widest text-gray-500 pt-4 pb-1 border-b border-gray-100">{trimmed}</p>
        }
        if (isBullet) {
          return (
            <p key={i} className="pl-4 text-gray-700">
              <span className="text-[#2563eb] mr-2">•</span>
              {trimmed.replace(/^[•\-\*·]\s*/, "")}
            </p>
          )
        }
        // Role/company line — slightly bolder
        if (/\d{4}/.test(trimmed) && trimmed.length < 120) {
          return <p key={i} className="font-medium text-[#0f0f0f]">{trimmed}</p>
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
}

const tabs = [
  "Tailored CV",
  "Cover Letter",
  "Key Changes",
  "Gaps",
  "Follow-ups",
  "ATS Notes",
] as const

type TabName = (typeof tabs)[number]

export function ResultsTabs({ results, coverLetter, loadingCoverLetter, onGenerateCoverLetter }: ResultsTabsProps) {
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

  return (
    <div className="animate-slide-up relative z-10 bg-white">
      {/* Tab bar */}
      <div className="relative border-b border-gray-100">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              ref={(el) => {
                if (el) tabRefs.current.set(tab, el)
              }}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm transition-colors duration-150 ${
                activeTab === tab
                  ? "text-[#0f0f0f] font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {/* Animated underline */}
        <div
          className="absolute bottom-0 h-0.5 bg-[#2563eb] transition-all duration-150 ease-out"
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
                <div className="prose prose-sm max-w-none leading-relaxed whitespace-pre-wrap text-[#0f0f0f]">
                  {coverLetter}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <p className="text-sm text-gray-500">Generate a tailored cover letter based on your CV and this role.</p>
                <button
                  onClick={onGenerateCoverLetter}
                  disabled={loadingCoverLetter}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors"
                >
                  {loadingCoverLetter ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Cover Letter</>}
                </button>
              </div>
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
            <button
              onClick={handleDownload}
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors duration-150"
            >
              <Download className="w-3.5 h-3.5" />
              Download as .txt
            </button>
          </div>
        )}

        {activeTab === "Key Changes" && (
          <div className="space-y-3">
            {results.keyChanges.map((change, i) => (
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
                <span className="text-sm text-[#0f0f0f]">{change.text}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "Gaps" && (
          <div className="space-y-3">
            {results.gaps.map((gap, i) => (
              <div
                key={i}
                className="p-4 bg-gray-50 rounded-lg flex items-start gap-3"
              >
                <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-600">{gap}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "Follow-ups" && (
          <div className="space-y-3">
            {results.followUps.map((question, i) => (
              <div
                key={i}
                className="p-4 bg-white rounded-lg shadow-sm border border-gray-100"
              >
                <span className="text-sm text-[#0f0f0f]">{question}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "ATS Notes" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              {results.atsNotes.status === "pass" ? (
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
              {results.atsNotes.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-gray-300 mt-1">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
