"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Check, Download, AlertCircle, CheckCircle, Loader2, Sparkles, ThumbsUp, ThumbsDown, Building2, FileText, GitCompare, Mail, MessagesSquare, ListChecks, Pencil, GraduationCap, CircleDot, ArrowRight, ExternalLink, RotateCcw, LayoutTemplate, ChevronDown, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import type { TailorResult, InterviewPrepResult, PitchesResult, CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"
import { EvidenceMatchPanel } from "@/components/career-arc/evidence-match-panel"
import { annotateCvLines } from "@/lib/career-arc-tailor-match"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import { downloadWordDoc } from "@/lib/word"
import { getTemplate, px, TEMPLATE_LIST, type CvTemplateId } from "@/lib/cv-templates"
import { isStackedCompanyLine, isStackedRoleTitleLine, isStackedDateLine } from "@/lib/cv-lines"
import { useCvTemplate } from "@/hooks/use-cv-template"
import { UpskillStrip } from "@/components/upskill"
import { InterviewPrep } from "./interview-prep"
import { InterviewPitches } from "./interview-pitches"

/**
 * Renders a plain-text CV in the chosen template.
 *
 * Styling comes from the same token set the Word export uses (lib/cv-templates),
 * with points converted to px — so this is a true preview of the downloaded
 * file, not a lookalike. Line classification mirrors lib/word.ts.
 */
/**
 * `annotations` maps a line index to an evidence chip label (EV·03). It is
 * screen-only decoration for the Tailored CV tab — omitted by the editor and
 * by every export path, so downloaded and copied CVs are unchanged.
 */
function FormattedCV({ text, template, annotations }: { text: string; template?: CvTemplateId; annotations?: Map<number, string> }) {
  const t = getTemplate(template)
  const lines = (text ?? "").split("\n")

  // Header block ends at the first section heading, as in the Word builder
  let firstSection = lines.findIndex(
    (l, i) => i > 0 && /^[A-Z][A-Z\s&/,'()-]+$/.test(l.trim()) && l.trim().length >= 3
  )
  if (firstSection === -1) firstSection = 0

  return (
    <div style={{ fontFamily: t.fontStack, color: t.bodyText.color }}>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} style={{ height: px(5) }} />

        const isHeading = /^[A-Z][A-Z\s&/,'()-]+$/.test(trimmed) && trimmed.length >= 3
        const isBullet = /^[•\-\*·]/.test(trimmed)
        const isRole = (/\b(19|20)\d{2}\b|Present/i.test(trimmed)) && trimmed.length < 130
        const isFirst = lines.slice(0, i).every((l) => !l.trim()) && i < 5

        // ── Header block ──
        if (isFirst && !isBullet) {
          return (
            <p key={i} style={{
              fontSize: px(t.name_.sizePt), fontWeight: 700, color: t.name_.color,
              letterSpacing: px(t.name_.letterSpacingPt), textAlign: t.name_.align,
              margin: `0 0 ${px(2)} 0`,
            }}>
              {t.name_.uppercase ? trimmed.toUpperCase() : trimmed}
            </p>
          )
        }
        if (firstSection > 0 && i < firstSection) {
          return (
            <p key={i} style={{
              fontSize: px(t.contact.sizePt), color: t.contact.color,
              textAlign: t.contact.align, margin: `0 0 ${px(3)} 0`,
            }}>{trimmed}</p>
          )
        }

        // ── Stacked role / company / dates block (shared with lib/word.ts) ──
        if (isStackedDateLine(lines, i)) {
          return (
            <p key={i} style={{
              fontSize: px(t.company.sizePt), color: t.company.color,
              fontStyle: t.company.italic ? "italic" : "normal",
              margin: `0 0 ${px(4)} 0`,
            }}>{trimmed}</p>
          )
        }
        if (isStackedCompanyLine(lines, i)) {
          return (
            <p key={i} style={{
              fontSize: px(t.role.sizePt + 1), fontWeight: 700, color: t.heading.color,
              margin: `0 0 ${px(1)} 0`,
            }}>{trimmed}</p>
          )
        }
        if (isStackedRoleTitleLine(lines, i)) {
          return (
            <p key={i} style={{
              fontSize: px(t.role.sizePt), fontWeight: 700, color: t.role.color,
              margin: `${px(9)} 0 ${px(1)} 0`,
            }}>{trimmed}</p>
          )
        }

        if (isHeading) {
          return (
            <p key={i} style={{
              fontSize: px(t.heading.sizePt), fontWeight: 700, color: t.heading.color,
              textTransform: t.heading.uppercase ? "uppercase" : "none",
              letterSpacing: px(t.heading.letterSpacingPt),
              borderBottom: t.heading.rule ? `1px solid ${t.heading.color}` : undefined,
              paddingBottom: t.heading.rule ? px(2) : undefined,
              margin: `${px(t.heading.marginTopPt)} 0 ${px(6)} 0`,
            }}>{trimmed}</p>
          )
        }

        if (isBullet) {
          return (
            <p key={i} style={{
              fontSize: px(t.bodyText.sizePt), color: t.bodyText.color,
              lineHeight: t.bodyText.lineHeight,
              margin: `0 0 ${px(3)} ${px(14)}`, textIndent: `-${px(9)}`,
            }}>
              <span style={{ color: t.accent }}>{t.bulletChar}</span>
              {"  "}{trimmed.replace(/^[•\-\*·]\s*/, "")}
              {annotations?.get(i) && (
                <span
                  title="Traceable to your evidence bank"
                  className="ml-1.5 inline-block rounded px-1 py-px align-middle font-mono text-[8.5px] font-bold tracking-[0.08em]"
                  style={{ background: "#fff7f4", border: "1px solid #f5d9d0", color: "#dc4f33" }}
                >
                  {annotations.get(i)}
                </span>
              )}
            </p>
          )
        }

        if (isRole) {
          return (
            <p key={i} style={{
              fontSize: px(t.role.sizePt), fontWeight: 700, color: t.role.color,
              margin: `${px(7)} 0 ${px(1)} 0`,
            }}>{trimmed}</p>
          )
        }

        const prev = lines[i - 1]?.trim() ?? ""
        const prevIsRole = (/\b(19|20)\d{2}\b|Present/i.test(prev)) && prev.length < 130
        if (trimmed.length < 90 && prevIsRole) {
          return (
            <p key={i} style={{
              fontSize: px(t.company.sizePt), color: t.company.color,
              fontStyle: t.company.italic ? "italic" : "normal",
              margin: `0 0 ${px(4)} 0`,
            }}>{trimmed}</p>
          )
        }

        return (
          <p key={i} style={{
            fontSize: px(t.bodyText.sizePt), color: t.bodyText.color,
            lineHeight: t.bodyText.lineHeight, margin: `0 0 ${px(4)} 0`,
          }}>{trimmed}</p>
        )
      })}
    </div>
  )
}

/** Full coverage map — the score mapping folded behind one disclosure row.
    Absorbs the old always-open Requirements coverage card and the separate
    gap-advice list (approved Figma frame, 11 Aug 2026). */
function CoverageMap({ rows, advice }: {
  rows: NonNullable<TailorResult["requirementsCoverage"]>; advice: string[]
}) {
  const [open, setOpen] = useState(false)
  const matched = rows.filter((r) => r.strength !== "none").length
  const missing = rows.length - matched

  const adviceRows = advice.length > 0 && (
    <div>
      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Advice · {advice.length}</p>
      <ul className="divide-y divide-gray-50">
        {advice.map((gap, i) => (
          <li key={i} className="px-4 py-2.5 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <span className="text-sm text-gray-600">{gap}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  if (rows.length === 0) {
    return adviceRows ? <div className="rounded-xl border border-gray-100 bg-white pb-2 shadow-sm">{adviceRows}</div> : null
  }

  const groups = [
    { key: "strong", label: "Strong", cls: "bg-green-50 text-green-600" },
    { key: "transferable", label: "Transferable", cls: "bg-[#ffeae4] text-[#dc4f33]" },
    { key: "partial", label: "Partial", cls: "bg-amber-50 text-amber-600" },
    { key: "none", label: "Missing", cls: "bg-red-50 text-red-500" },
  ]
  const known = new Set(groups.map((g) => g.key))
  const other = rows.filter((r) => !known.has(r.strength))

  const section = (label: string, cls: string, items: typeof rows) => items.length > 0 && (
    <div key={label}>
      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label} · {items.length}</p>
      <ul className="divide-y divide-gray-50">
        {items.map((r, i) => (
          <li key={i} className="px-4 py-2.5 flex items-start gap-3">
            <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${cls}`}>{label}</span>
            <div className="min-w-0">
              <p className="text-sm text-[#1e1813] leading-snug">
                {r.requirement}
                {r.type === "must" && (
                  <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">must-have</span>
                )}
              </p>
              {r.evidence && <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">↳ {r.evidence}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-[#e0d6c9] bg-[#fdfcf9] px-4 py-3 text-left transition-colors hover:border-[#dc4f33]/50 focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#dc4f33] text-[10px] font-bold text-white" aria-hidden="true">✓</span>
        <span className="shrink-0 text-[12.5px] font-semibold text-[#1e1813]">Full coverage map · {rows.length} requirements</span>
        <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-[#a89e93] sm:inline">
          {matched} matched · {missing} missing · how your score is computed
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] text-[#8a8178]">
          {open ? "hide" : "view detail"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-100 bg-white pb-2 shadow-sm">
          {groups.map((g) => section(g.label, g.cls, rows.filter((r) => r.strength === g.key)))}
          {section("Other", "bg-gray-100 text-gray-500", other)}
          {adviceRows && <div className="border-t border-gray-100">{adviceRows}</div>}
        </div>
      )}
    </div>
  )
}

/** Template chooser — restyles the preview and the download together */
function TemplatePicker({
  value, onChange,
}: { value: CvTemplateId; onChange: (id: CvTemplateId) => void }) {
  const [open, setOpen] = useState(false)
  const active = getTemplate(value)

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#1e1813] transition-colors"
        aria-expanded={open}
      >
        <LayoutTemplate className="w-4 h-4" />
        Template: <span className="font-medium text-[#1e1813]">{active.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {TEMPLATE_LIST.map((tpl) => {
            const selected = tpl.id === value
            return (
              <button
                key={tpl.id}
                onClick={() => { onChange(tpl.id); setOpen(false) }}
                title={tpl.blurb}
                className={`text-left rounded-xl border p-3 transition-all ${
                  selected
                    ? "border-[#dc4f33] bg-[#fff7f4] ring-1 ring-[#dc4f33]/30"
                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[13px] font-bold text-[#1e1813] truncate"
                    style={{ fontFamily: tpl.fontStack }}
                  >
                    {tpl.name}
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#dc4f33" }} />}
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400 leading-snug">{tpl.bestFor}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Plain-text editor for a generated output (CV or cover letter).
 *
 * Deliberately a raw textarea rather than a rich editor: everything downstream
 * — the Word/txt download, ATS keyword checking, tracker sync — consumes plain
 * text, so anything richer would have to be flattened straight back out again.
 *
 * It is still typeset in the SELECTED TEMPLATE's face and size, not mono. Users
 * reported the mono default read as "robotic" and made it hard to tell which
 * part of the document they were editing, because the thing on screen looked
 * nothing like the thing they downloaded. Plain text underneath, final
 * appearance on top.
 */
function OutputEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  revertTo,
  onRevert,
  minHeight = "50vh",
  label,
  template,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  revertTo?: string | null
  onRevert?: () => void
  minHeight?: string
  label: string
  /** Edit in the face you'll download in — see the note above. */
  template?: CvTemplateId
}) {
  const dirty = true // the parent only mounts this while editing
  const t = getTemplate(template)
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel() }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave() }
        }}
        aria-label={label}
        spellCheck
        autoFocus
        className="w-full bg-white border border-[#f0d9d2] rounded-lg p-4 resize-y focus:outline-none focus:border-[#dc4f33] focus:ring-1 focus:ring-[#dc4f33]/30"
        style={{
          minHeight,
          fontFamily: t.fontStack,
          fontSize: px(t.bodyText.sizePt),
          lineHeight: t.bodyText.lineHeight,
          color: t.bodyText.color,
        }}
      />
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={onSave}
          disabled={saving || !value.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Check className="w-4 h-4" />Save changes</>}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-2 text-sm text-gray-500 hover:text-[#1e1813] transition-colors"
        >
          Cancel
        </button>
        {revertTo && revertTo !== value && onRevert && (
          <button
            onClick={onRevert}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-[#dc4f33] transition-colors"
            title="Restore the original AI-generated version"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revert to AI version
          </button>
        )}
        {dirty && (
          <span className="ml-auto text-[11px] text-gray-400">⌘↵ to save · Esc to cancel</span>
        )}
      </div>
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

// "Upskill" was removed here: the per-run plan it wrote to tailor_history.upskill
// fed nothing else in the product. It returns in Phase 4 reading from
// career_roadmap_items, so closing a gap actually counts. See
// docs/PROJECT.md and the Quick Wins plan.
const tabs = [
  "Tailored CV",
  "Compare",
  "Cover Letter",
  "Interview Prep",
  "Company",
  "Key Changes",
  "Gaps",
  "Follow-ups",
  "ATS Notes",
] as const

export type ResultTabName = (typeof tabs)[number]
type TabName = ResultTabName

/** Primary “job kit” — everything else lives under More. */
const PRIMARY_TABS: TabName[] = ["Tailored CV", "Gaps", "Cover Letter", "Interview Prep"]
const MORE_TABS: TabName[] = ["Compare", "Company", "Key Changes", "Follow-ups", "ATS Notes"]

const TAB_ICONS: Record<TabName, LucideIcon> = {
  "Tailored CV": FileText,
  "Compare": GitCompare,
  "Cover Letter": Mail,
  "Interview Prep": MessagesSquare,
  "Company": Building2,
  "Key Changes": Pencil,
  "Gaps": ListChecks,
  "Follow-ups": MessagesSquare,
  "ATS Notes": CheckCircle,
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
  /** Enables hand-editing of the tailored CV. Resolves once the edit is saved. */
  onSaveTailoredCV?: (text: string) => Promise<void>
  /** Enables hand-editing of the cover letter. */
  onSaveCoverLetter?: (text: string) => Promise<void>
  /** Enhanced (gated) workspace styling */
  enhanced?: boolean
  /** Controlled tab — when set, parent owns which tab is open. */
  activeTab?: ResultTabName
  onActiveTabChange?: (tab: ResultTabName) => void
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
  onSaveTailoredCV,
  onSaveCoverLetter,
  enhanced = false,
  activeTab: controlledTab,
  onActiveTabChange,
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
  const primaryTabs = PRIMARY_TABS.filter((t) => visibleTabs.includes(t))
  const moreTabs = MORE_TABS.filter((t) => visibleTabs.includes(t))

  const [internalTab, setInternalTab] = useState<TabName>("Tailored CV")
  const activeTab = controlledTab ?? internalTab
  const setActiveTab = (tab: TabName) => {
    if (controlledTab === undefined) setInternalTab(tab)
    onActiveTabChange?.(tab)
  }

  const [copied, setCopied] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // Hand-editing. One editor open at a time; the draft lives up here so
  // switching tabs mid-edit doesn't throw the user's work away.
  const [editing, setEditing] = useState<"cv" | "letter" | null>(null)
  const [draft, setDraft] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  // Template preference is read here rather than drilled from each page, so the
  // tailor page and the history view can never disagree about it.
  const { template, setTemplate } = useCvTemplate()
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const moreWrapRef = useRef<HTMLDivElement>(null)
  const moreActive = moreTabs.includes(activeTab)

  useEffect(() => {
    // When the parent opens a tab that isn't visible (e.g. Interview Prep on
    // history), fall back to Tailored CV.
    if (!visibleTabs.includes(activeTab) && visibleTabs[0]) {
      setActiveTab(visibleTabs[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs.join("|"), activeTab])

  useEffect(() => {
    const key = moreActive ? "__more__" : activeTab
    const activeButton = tabRefs.current.get(key)
    if (activeButton) {
      setUnderlineStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }
  }, [activeTab, moreActive, primaryTabs.length, moreTabs.length])

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!moreWrapRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [moreOpen])

  // Evidence bank, fetched once and shared by the CV chips and the rail.
  // Stays empty (and everything evidence-related stays hidden) for users
  // outside the Career Arc beta or when the fetch fails.
  const [evidenceBank, setEvidenceBank] = useState<EvidenceRow[]>([])
  useEffect(() => {
    let cancelled = false
    fetch("/api/career-evidence")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.evidence)) setEvidenceBank(data.evidence as EvidenceRow[])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const cvAnnotations = useMemo(
    () => (evidenceBank.length > 0 ? annotateCvLines(results.tailoredCV, evidenceBank) : undefined),
    [results.tailoredCV, evidenceBank],
  )

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

  const handleDownloadWord = () => downloadWordDoc(results.tailoredCV, "tailored-cv.doc", template)

  // Gaps this run flagged, as concrete skills: prefer the JD's exact keywords,
  // fall back to the requirement text. Feeds the quick-wins strip.
  const weakSkills = Array.from(new Set(
    (results.requirementsCoverage ?? [])
      .filter((r) => r.strength === "partial" || r.strength === "none")
      .flatMap((r) => (r.keywords && r.keywords.length ? r.keywords : [r.requirement]))
      .map((s) => s.trim()).filter(Boolean)
  )).slice(0, 6)

  const startEdit = (which: "cv" | "letter", text: string) => {
    // The draft survives tab switches, so the other tab's Edit button is still
    // reachable mid-edit. Opening it would silently bin the unsaved draft.
    if (editing && editing !== which) {
      toast.error(`Save or cancel your ${editing === "cv" ? "CV" : "cover letter"} edit first`)
      return
    }
    setEditing(which)
    setDraft(text)
  }

  const saveEdit = async () => {
    const which = editing
    const save = which === "cv" ? onSaveTailoredCV : which === "letter" ? onSaveCoverLetter : null
    if (!save) return
    setSavingEdit(true)
    try {
      await save(draft)
      setEditing(null)
      toast.success(which === "cv" ? "CV updated" : "Cover letter updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your changes")
    } finally {
      setSavingEdit(false)
    }
  }

  /** Small "Edit" affordance shown beside Copy on editable outputs */
  const editButton = (which: "cv" | "letter", text: string) => (
    <button
      onClick={() => startEdit(which, text)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all duration-150"
    >
      <Pencil className="w-3.5 h-3.5" />
      Edit
    </button>
  )

  return (
    <div className="animate-slide-up relative z-10 bg-white">
      {/* Tab bar — primary job kit + More */}
      <div className="relative border-b border-gray-100">
        <div className="flex gap-1 flex-wrap items-center">
          {primaryTabs.map((tab) => {
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
          {moreTabs.length > 0 && (
            <div className="relative" ref={moreWrapRef}>
              <button
                ref={(el) => {
                  if (el) tabRefs.current.set("__more__", el)
                }}
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                className={`inline-flex items-center gap-1 px-4 py-3 text-sm transition-colors duration-150 ${
                  moreActive
                    ? "text-[#1e1813] font-medium"
                    : enhanced ? "text-gray-400 hover:text-[#dc4f33]" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                More
                {moreActive && (
                  <span className="text-[11px] font-normal text-[#1e1813]/45">· {activeTab}</span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded-xl border border-[#eee6da] bg-white py-1 shadow-lg"
                >
                  {moreTabs.map((tab) => {
                    const Icon = TAB_ICONS[tab]
                    return (
                      <button
                        key={tab}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setActiveTab(tab)
                          setMoreOpen(false)
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                          activeTab === tab
                            ? "bg-[#fff7f4] font-medium text-[#1e1813]"
                            : "text-[#1e1813]/70 hover:bg-[#f9f6f0]"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 text-[#dc4f33]" />
                        {tab}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
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
              editing === "letter" ? (
                <OutputEditor
                  label="Edit your cover letter"
                  value={draft}
                  onChange={setDraft}
                  onSave={saveEdit}
                  onCancel={() => setEditing(null)}
                  saving={savingEdit}
                  minHeight="40vh"
                  template={template}
                />
              ) : (
              <>
                <div className="flex justify-end gap-3 mb-4">
                  {onSaveCoverLetter && editButton("letter", coverLetter)}
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
              )
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
          <div className={evidenceBank.length > 0 && editing !== "cv" ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start" : ""}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            {editing === "cv" ? (
              <OutputEditor
                label="Edit your tailored CV"
                value={draft}
                onChange={setDraft}
                onSave={saveEdit}
                onCancel={() => setEditing(null)}
                saving={savingEdit}
                revertTo={results.tailoredCVOriginal ?? null}
                onRevert={() => setDraft(results.tailoredCVOriginal ?? draft)}
                minHeight="55vh"
                template={template}
              />
            ) : (
            <>
            <div className="flex justify-end gap-3 mb-4">
              {onSaveTailoredCV && editButton("cv", results.tailoredCV)}
              <button
                onClick={handleCopy}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-150 ${
                  copied ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {copied ? <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Copied</span> : "Copy"}
              </button>
            </div>
            <TemplatePicker value={template} onChange={setTemplate} />
            <FormattedCV text={results.tailoredCV} template={template} annotations={cvAnnotations} />
            {results.tailoredCVOriginal && results.tailoredCVOriginal !== results.tailoredCV && (
              <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                <Pencil className="w-3 h-3" />
                Edited by you — downloads and copies use your version.
              </p>
            )}
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
            </>
            )}

            {historyId && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <FeedbackBar historyId={historyId} />
              </div>
            )}
          </div>
          {/* Screen 05's rail: the evidence behind this CV, beside it on wide
              screens. Hidden while editing so the editor keeps full width. */}
          {evidenceBank.length > 0 && editing !== "cv" && (results.requirementsCoverage ?? []).length > 0 && (
            <aside className="hidden xl:block xl:sticky xl:top-4">
              <EvidenceMatchPanel
                requirements={results.requirementsCoverage ?? []}
                jobTitle={results.jobTitle}
                companyName={results.companyName}
                evidence={evidenceBank}
                compact
              />
            </aside>
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
                <FormattedCV text={originalCV} template={template} />
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#ffd8cd] shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#ffd8cd] bg-[#ffeae4]">
                <h3 className="text-xs font-semibold text-[#dc4f33]">Tailored</h3>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto">
                <FormattedCV text={results.tailoredCV} template={template} />
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
            {/* Evidence traceability (Career Arc beta): which bank card backs
                which requirement, plus named gaps. Renders nothing for users
                without an evidence bank — purely additive to this tab. */}
            {(results.requirementsCoverage ?? []).length > 0 && (
              <EvidenceMatchPanel
                requirements={results.requirementsCoverage ?? []}
                jobTitle={results.jobTitle}
                companyName={results.companyName}
              />
            )}

            {/* Full coverage map + advice — one disclosure, closed by default */}
            <CoverageMap rows={results.requirementsCoverage ?? []} advice={results.gaps ?? []} />

            {/* Close these gaps — quick wins land on the career path, right at
                the moment the gaps are freshest. Replaces the old Upskill tab,
                whose plan lived on the run where nothing else could see it. */}
            <div className="pt-2">
              <UpskillStrip
                historyId={historyId}
                weakSkills={weakSkills}
                jobTitle={results.jobTitle}
                condensed={evidenceBank.length > 0 && (results.requirementsCoverage ?? []).length > 0}
              />
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
