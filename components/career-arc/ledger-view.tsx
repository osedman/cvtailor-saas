"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { ShareModal } from "@/components/career-arc/share-modal"
import type { CareerProfileSections } from "@/lib/anthropic"
import {
  PATH_CHART_MIN_ROLES,
  arcPeriod,
  deriveGlance,
  isBreakChapter,
  pathLayout,
  type EvidenceRow,
} from "@/lib/career-arc-ledger"

const ACCENT = "#dc4f33"
const INK = "#1e1813"
const SAND = "#e0d6c9"
const SAND_LT = "#ece2d6"

export type EvidenceAction =
  | { action: "pin"; id: string }
  | { action: "hide"; id: string }
  | { action: "reorder"; order: string[] }
  | { action: "rephrase"; id: string }
  | { action: "add-from-cv"; text: string; category: string }

interface LedgerViewProps {
  sections: CareerProfileSections
  lastExtracted: string | null
  evidence: EvidenceRow[]
  usage: Record<string, number>
  usedCvCount: number
  /** Runs the PATCH and resolves with the fresh evidence list (throws on error). */
  onAction: (action: EvidenceAction) => Promise<void>
  onRebuild: () => void
  onReplay: () => void
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const handler = () => setReduced(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return reduced
}

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

function useCountUp(target: number, active: boolean, durationMs = 900) {
  const [value, setValue] = useState(0)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    if (!active) return
    if (reduced || target === 0) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      // rAF timestamps can predate the captured start — clamp low or the eased
      // value goes negative for a frame and the stat flashes "-4".
      const t = Math.max(0, Math.min(1, (now - start) / durationMs))
      setValue(Math.round((1 - Math.pow(1 - t, 3)) * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, durationMs, reduced])
  return value
}

/** Mono section label of the ledger chrome, e.g. "EVIDENCE BANK · 12 PROOFS". */
function SectionHead({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex items-baseline mb-4.5 gap-3">
      <h2 className="font-mono text-[12px] font-bold tracking-[0.22em] text-[#1e1813]">{label}</h2>
      {note && <span className="ml-auto text-[12px] text-[#a89e93] text-right">{note}</span>}
    </div>
  )
}

function GlanceStatBlock({ value, label, active }: { value: number; label: string; active: boolean }) {
  const count = useCountUp(value, active)
  return (
    <div className="bg-white border rounded-2xl px-5 py-4" style={{ borderColor: SAND_LT }}>
      <p className="text-[30px] font-extrabold tabular-nums leading-none" style={{ color: ACCENT }}>{count}</p>
      <p className="mt-2 font-mono text-[10px] tracking-[0.14em] uppercase text-[#8a8178]">{label}</p>
    </div>
  )
}

function PathChart({ sections }: { sections: CareerProfileSections }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const reduced = usePrefersReducedMotion()
  const layout = pathLayout(sections)
  if (!layout) return null
  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: 4, strokeLinejoin: "round" as const }
  return (
    <div ref={ref} className="bg-white border rounded-2xl px-5 pt-5 pb-3" style={{ borderColor: SAND_LT }}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="w-full" role="img" aria-label="Career path chart">
        <path
          d={layout.linePath} fill="none" stroke={ACCENT} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
          style={reduced ? undefined : { strokeDasharray: 1600, strokeDashoffset: visible ? 0 : 1600, transition: "stroke-dashoffset 1.4s ease-out" }}
        />
        <path d={layout.futurePath} fill="none" stroke={ACCENT} strokeWidth={5} strokeLinecap="round" strokeDasharray="1 14" opacity={0.65} />
        {layout.nodes.map((node, i) => (
          <g key={i} style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease-out ${0.3 + i * 0.12}s` }}>
            {node.isMilestone ? (
              <>
                <circle cx={node.x} cy={node.y} r={11} fill="#fff" stroke={INK} strokeWidth={4} />
                <circle cx={node.x} cy={node.y} r={4.5} fill={ACCENT} />
              </>
            ) : (
              <circle cx={node.x} cy={node.y} r={8} fill="#fff" stroke={ACCENT} strokeWidth={4} />
            )}
            <text x={node.x} y={node.y + 24} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={INK} style={halo}>{node.title}</text>
            <text x={node.x} y={node.y + 38} textAnchor="middle" fontSize={10} fontWeight={500} fill="#a89e93" style={halo}>{node.sub}</text>
            {node.year && (
              <text x={node.x} y={node.y - 16} textAnchor="middle" fontSize={9.5} fill="#55504a" className="font-mono" style={halo}>{node.year}</text>
            )}
          </g>
        ))}
        <g style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease-out 1s" }}>
          <circle cx={layout.here.x} cy={layout.here.y} r={10} fill={ACCENT} />
          <circle cx={layout.here.x} cy={layout.here.y} r={17} fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={0.4} />
          <text x={layout.here.x} y={layout.here.y - 24} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={ACCENT} style={halo}>You are here</text>
          <rect x={layout.nextBox.x} y={layout.nextBox.y} width={layout.nextBox.w} height={layout.nextBox.h} rx={12} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={layout.nextBox.x + layout.nextBox.w / 2} y={layout.nextBox.y + 18} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={INK}>Next chapter</text>
          <text x={layout.nextBox.x + layout.nextBox.w / 2} y={layout.nextBox.y + 33} textAnchor="middle" fontSize={10} fill="#a89e93">open</text>
        </g>
      </svg>
      <div className="flex flex-wrap justify-between gap-2 border-t mt-2 pt-3 text-[12px] text-[#a89e93]" style={{ borderColor: SAND_LT }}>
        <span>
          {sections.growth?.fromTitle && sections.growth?.toTitle
            ? `${sections.growth.fromTitle} → ${sections.growth.toTitle} · ${sections.timeline.length} roles, one line`
            : `${sections.timeline.length} roles, one line`}
        </span>
        <span>Career breaks render as chapters — recorded, never counted against you</span>
      </div>
    </div>
  )
}

/** Screen 02: under three roles the record itself carries the page. */
function ChapterList({ sections }: { sections: CareerProfileSections }) {
  const chapters = sections.chapters ?? []
  if (chapters.length === 0) {
    return <p className="text-[12.5px] text-[#a89e93]">Your chapters appear here once your arc has been extracted from a CV with dated roles.</p>
  }
  return (
    <div>
      <div className="space-y-2.5">
        {chapters.map((ch, i) => {
          const isBreak = isBreakChapter(ch.name)
          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-5 py-4"
              style={isBreak ? { background: "#fff7f4", borderColor: "#f5d9d0" } : { background: "#fff", borderColor: SAND_LT }}
            >
              <span className="font-mono text-[11px] tracking-[0.08em] text-[#55504a] w-28 shrink-0">{ch.span}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#1e1813]">{ch.name}</p>
                <p className="text-[12.5px] text-[#8a8178]">{ch.summary}</p>
              </div>
              <span
                className="font-mono text-[9.5px] tracking-[0.14em] rounded-full border px-3 py-1"
                style={isBreak ? { borderColor: "#f5d9d0", color: ACCENT } : { borderColor: SAND, color: "#55504a" }}
              >
                {isBreak ? "RECORDED · NOT COUNTED AGAINST YOU" : `CHAPTER ${i + 1}`}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[12px] text-[#a89e93]">
        The path chart appears once an arc has {PATH_CHART_MIN_ROLES} working chapters — until then, the record speaks for itself.
      </p>
    </div>
  )
}

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1"

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono text-[9.5px] tracking-[0.1em] px-2.5 py-1.5 rounded-lg border bg-[#f9f6f0] text-[#55504a] transition-colors hover:border-[#dc4f33] hover:text-[#dc4f33] disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
      style={{ borderColor: SAND }}
    >
      {label}
    </button>
  )
}

function sourceChip(row: EvidenceRow): string {
  const parts = [row.source_role, row.source_company].filter(Boolean).map((p) => p.toUpperCase())
  return parts.join(" · ")
}

function EvidenceBank({
  evidence, usage, busy, onAction, onRebuild,
}: {
  evidence: EvidenceRow[]
  usage: Record<string, number>
  busy: boolean
  onAction: (a: EvidenceAction) => void
  onRebuild: () => void
}) {
  const [showHidden, setShowHidden] = useState(false)
  const [addText, setAddText] = useState("")
  const [addCategory, setAddCategory] = useState("craft")
  const [adding, setAdding] = useState(false)

  const ordered = [...evidence].sort((a, b) => a.sort_order - b.sort_order)
  const pinned = ordered.find((e) => e.pinned && !e.hidden) ?? null
  const cards = ordered.filter((e) => !e.hidden && e.id !== pinned?.id)
  const hidden = ordered.filter((e) => e.hidden)
  const visibleIds = [...(pinned ? [pinned.id] : []), ...cards.map((c) => c.id)]

  const moveUp = (id: string) => {
    const idx = cards.findIndex((c) => c.id === id)
    if (idx <= 0) return
    const next = [...cards]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    onAction({ action: "reorder", order: [...(pinned ? [pinned.id] : []), ...next.map((c) => c.id), ...hidden.map((h) => h.id)] })
  }

  const submitAdd = async () => {
    if (addText.trim().length < 20) { toast.error("Paste a full line from your CV — at least 20 characters."); return }
    setAdding(true)
    try {
      await Promise.resolve(onAction({ action: "add-from-cv", text: addText.trim(), category: addCategory }))
      setAddText("")
    } finally {
      setAdding(false)
    }
  }

  const usedIn = (id: string) => {
    const n = usage[id] ?? 0
    return n === 0 ? "not reused yet" : `used in ${n} CV${n === 1 ? "" : "s"}`
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {pinned && (
        <div className="sm:col-span-2 relative overflow-hidden rounded-[18px] px-7 py-6" style={{ background: INK }}>
          <div className="absolute pointer-events-none" style={{
            width: 300, height: 300, right: -110, top: -110, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(220,79,51,0.35) 0%, transparent 70%)",
          }} />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: "#f4a58e" }}>PROUDEST WORK · YOU PINNED THIS</span>
              <button
                onClick={() => onAction({ action: "pin", id: pinned.id })}
                disabled={busy}
                className={`font-mono text-[9.5px] tracking-[0.1em] px-2.5 py-1 rounded-lg border border-[rgba(249,246,240,0.25)] text-[#cfc8bf] hover:text-white hover:border-white transition-colors disabled:opacity-40 ${FOCUS_RING}`}
              >
                UNPIN
              </button>
            </div>
            <p className="mt-2.5 text-[20px] font-bold leading-[1.45] max-w-[44rem]" style={{ color: "#f9f6f0" }}>
              {pinned.rephrased_text ?? pinned.claim}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {sourceChip(pinned) && (
                <span className="font-mono text-[10.5px] rounded-full px-3 py-1.5 border text-[#f9f6f0]" style={{ background: "rgba(249,246,240,0.09)", borderColor: "rgba(249,246,240,0.2)" }}>
                  {sourceChip(pinned)}{pinned.source_span ? ` · ${pinned.source_span}` : ""}
                </span>
              )}
              {pinned.cv_line !== null && (
                <span className="font-mono text-[10.5px] rounded-full px-3 py-1.5 border text-[#f9f6f0]" style={{ background: "rgba(249,246,240,0.09)", borderColor: "rgba(249,246,240,0.2)" }}>
                  SOURCE: CV LINE {pinned.cv_line}
                </span>
              )}
              <span className="font-mono text-[10.5px] rounded-full px-3 py-1.5 text-white uppercase" style={{ background: ACCENT }}>{usedIn(pinned.id)}</span>
            </div>
          </div>
        </div>
      )}

      {cards.map((row, i) => (
        <div key={row.id} className="group relative bg-white border rounded-[18px] px-5 py-5 transition-all hover:shadow-[0_10px_28px_rgba(30,24,19,0.10)] hover:-translate-y-0.5" style={{ borderColor: SAND_LT }}>
          <div className="absolute top-3.5 right-3.5 flex gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <ActionButton label="PIN" onClick={() => onAction({ action: "pin", id: row.id })} disabled={busy} />
            <ActionButton label="REPHRASE" onClick={() => onAction({ action: "rephrase", id: row.id })} disabled={busy} />
            {i > 0 && <ActionButton label="▲ UP" onClick={() => moveUp(row.id)} disabled={busy} />}
            <ActionButton label="HIDE" onClick={() => onAction({ action: "hide", id: row.id })} disabled={busy} />
          </div>
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-[#8a8178]">
            {String(i + (pinned ? 2 : 1)).padStart(2, "0")} · {row.category.toUpperCase()}
          </span>
          <p className="mt-2 text-[14.5px] font-semibold leading-[1.5] text-[#1e1813]">{row.rephrased_text ?? row.claim}</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {sourceChip(row) && (
              <span className="font-mono text-[10.5px] rounded-full px-3 py-1 border" style={{ background: "#fff7f4", borderColor: "#f5d9d0", color: INK }}>{sourceChip(row)}</span>
            )}
            <span className="text-[11px] text-[#a89e93]">{usedIn(row.id)}</span>
          </div>
        </div>
      ))}

      <div className="sm:col-span-2 rounded-[18px] border-2 border-dashed px-6 py-6 text-center" style={{ borderColor: SAND }}>
        <p className="font-mono text-[11px] tracking-[0.18em] text-[#55504a]">+ ADD FROM CV</p>
        <p className="mx-auto mt-2 max-w-[30rem] text-[12px] leading-[1.6] text-[#a89e93]">
          Nothing invented — only text already in your CV can become a new evidence card. Paste the exact line and Tailr will source-check it.
        </p>
        <div className="mx-auto mt-4 flex max-w-[34rem] flex-col gap-2 sm:flex-row">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitAdd() }}
            placeholder="Paste the exact line from your CV…"
            aria-label="Exact line from your CV"
            name="cv-line"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300"
            style={{ borderColor: SAND }}
          />
          <select
            value={addCategory}
            onChange={(e) => setAddCategory(e.target.value)}
            aria-label="Evidence category"
            className="rounded-lg border px-2 py-2 text-[12px] text-[#55504a] outline-none"
            style={{ borderColor: SAND }}
          >
            {["quant", "scope", "leadership", "systems", "craft"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={submitAdd}
            disabled={busy || adding}
            className={`rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-all hover:brightness-105 disabled:opacity-50 ${FOCUS_RING}`}
            style={{ background: ACCENT }}
          >
            {adding ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Adding…" /> : "Source-check & add"}
          </button>
        </div>
        <button onClick={onRebuild} className={`mt-3 rounded-[10px] border bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#1e1813] transition-colors hover:border-[#dc4f33] ${FOCUS_RING}`} style={{ borderColor: SAND }}>
          Re-extract from latest CV
        </button>
      </div>

      {hidden.length > 0 && (
        <div className="sm:col-span-2">
          <button onClick={() => setShowHidden((v) => !v)} className={`rounded text-[12px] text-[#a89e93] underline-offset-2 hover:underline ${FOCUS_RING}`}>
            {showHidden ? "Hide" : "Show"} {hidden.length} hidden card{hidden.length === 1 ? "" : "s"}
          </button>
          {showHidden && (
            <div className="mt-2 space-y-2">
              {hidden.map((row) => (
                <div key={row.id} className="flex items-center gap-3 rounded-xl border bg-white/60 px-4 py-2.5" style={{ borderColor: SAND_LT }}>
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-[#8a8178]">{row.rephrased_text ?? row.claim}</p>
                  <ActionButton label="UNHIDE" onClick={() => onAction({ action: "hide", id: row.id })} disabled={busy} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {visibleIds.length === 0 && hidden.length === 0 && (
        <p className="sm:col-span-2 text-[13px] text-[#a89e93]">No evidence cards yet — rebuild your arc to extract them from your CV.</p>
      )}
    </div>
  )
}

export function LedgerView({ sections, lastExtracted, evidence, usage, usedCvCount, onAction, onRebuild, onReplay }: LedgerViewProps) {
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const glanceRef = useInView<HTMLDivElement>()
  const visibleCount = evidence.filter((e) => !e.hidden).length
  const period = arcPeriod(sections.timeline)
  const glance = deriveGlance(sections, evidence, usage, usedCvCount)
  const hasChart = (sections.timeline?.length ?? 0) >= PATH_CHART_MIN_ROLES

  const run = async (action: EvidenceAction) => {
    if (busy) return
    setBusy(true)
    try {
      await onAction(action)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't save — try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-20 pt-4">
      {sharing && <ShareModal sections={sections} evidence={evidence} onClose={() => setSharing(false)} />}
      <div className="mb-5 flex items-center gap-2.5">
        <span className="font-mono text-[11.5px] tracking-[0.14em] text-[#55504a]">CAREER ARC</span>
        <span className="flex-1" />
        <button onClick={onReplay} className={`rounded-[10px] border bg-white px-4 py-2 text-[13px] font-semibold text-[#1e1813] transition-colors hover:border-[#dc4f33] ${FOCUS_RING}`} style={{ borderColor: SAND }}>
          Replay reveal
        </button>
        <button
          onClick={() => setSharing(true)}
          className={`rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(220,79,51,0.28)] transition-all hover:brightness-105 ${FOCUS_RING}`}
          style={{ background: ACCENT }}
        >
          Share my arc
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border shadow-[0_16px_48px_rgba(30,24,19,0.10)]" style={{ background: "#fdfcf9", borderColor: SAND }}>
        <div className="relative border-b px-6 pb-7 pt-9 sm:px-12" style={{ borderColor: SAND_LT }}>
          <h1 className="text-[28px] font-black tracking-[-0.01em] text-[#1e1813] sm:text-[34px]">
            {sections.identity.name || sections.identity.roleLine}<span style={{ color: ACCENT }}>.</span>
          </h1>
          <div className="mt-3.5 flex flex-wrap gap-x-7 gap-y-1.5">
            {period && (
              <span className="font-mono text-[11px] tracking-[0.08em] text-[#8a8178]">PERIOD <b className="font-medium text-[#55504a]">{period}</b></span>
            )}
            <span className="font-mono text-[11px] tracking-[0.08em] text-[#8a8178]">BASIS <b className="font-medium text-[#55504a]">evidence-first · nothing invented</b></span>
            {lastExtracted && (
              <span className="font-mono text-[11px] tracking-[0.08em] text-[#8a8178]">LAST EXTRACTED <b className="font-medium text-[#55504a]">{lastExtracted}</b></span>
            )}
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold" style={{ background: "#fff7f4", borderColor: "#f5d9d0" }}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: ACCENT }} />
            Private — visible only to you until you share
          </div>
          <div className="absolute right-6 top-8 hidden -rotate-[11deg] rounded-lg border-[3px] px-4 pb-2 pt-2 text-center opacity-90 sm:right-11 md:block" style={{ borderColor: ACCENT, color: ACCENT }}>
            <div className="font-mono text-[15px] font-bold tracking-[0.22em]">NOTHING INVENTED</div>
            <div className="mt-0.5 font-mono text-[8px] tracking-[0.16em]">
              {visibleCount} PROOF{visibleCount === 1 ? "" : "S"} · SOURCED FROM YOUR CV
            </div>
          </div>
        </div>

        {glance.length > 0 && (
          <section ref={glanceRef.ref} className="border-b px-6 py-7 sm:px-12" style={{ borderColor: SAND_LT }}>
            <SectionHead label="AT A GLANCE" note="re-extracted whenever your CV changes" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {glance.map((st, i) => (
                <GlanceStatBlock key={i} value={st.value} label={st.label} active={glanceRef.visible} />
              ))}
            </div>
          </section>
        )}

        <section className="border-b px-6 py-7 sm:px-12" style={{ borderColor: SAND_LT }}>
          <SectionHead
            label="THE PATH"
            note={hasChart ? "chapters, not levels — sideways moves & breaks are entries too" : "every chapter counts — a break is an entry, not a gap"}
          />
          {hasChart ? <PathChart sections={sections} /> : <ChapterList sections={sections} />}
        </section>

        <section className="border-b px-6 py-7 sm:px-12" style={{ borderColor: SAND_LT }}>
          <SectionHead
            label={`EVIDENCE BANK · ${visibleCount} PROOF${visibleCount === 1 ? "" : "S"}`}
            note="hover a card to edit — everything traceable to your CV"
          />
          <EvidenceBank evidence={evidence} usage={usage} busy={busy} onAction={run} onRebuild={onRebuild} />
        </section>

        <section className="px-6 py-7 sm:px-12">
          <SectionHead label="HOW THIS PAGE WORKS" />
          <div className="rounded-2xl border bg-white px-6 py-5" style={{ borderColor: SAND_LT }}>
            <p className="text-[12.5px] leading-[1.8] text-[#55504a]"><b className="font-mono text-[11px] tracking-[0.1em] text-[#1e1813]">SOURCING.</b> Every card comes from your CV or your own written answers. Adjectives are expensed immediately.</p>
            <p className="text-[12.5px] leading-[1.8] text-[#55504a]"><b className="font-mono text-[11px] tracking-[0.1em] text-[#1e1813]">YOU CONTROL THIS PAGE.</b> Nothing is shared until you press Share — and then redaction is per-claim; you decide exactly what a recipient sees.</p>
            <p className="text-[12.5px] leading-[1.8] text-[#55504a]"><b className="font-mono text-[11px] tracking-[0.1em] text-[#1e1813]">RE-EXTRACTION.</b> A new CV refreshes the ledger, keeping your pinned proudest work and your rephrased cards. Nothing is invented on top.</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4 px-6 py-6 sm:px-12" style={{ background: INK }}>
          <div>
            <p className="text-[15.5px] font-bold" style={{ color: "#f9f6f0" }}>Tailoring for a new role?</p>
            <p className="text-[12.5px] text-[#8a8178]">Start from your evidence — Tailr picks the proofs that match the job description.</p>
          </div>
          <span className="flex-1" />
          <Link
            href="/tailor"
            className={`whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(220,79,51,0.28)] transition-all hover:brightness-105 ${FOCUS_RING}`}
            style={{ background: ACCENT }}
          >
            Tailor a CV from this →
          </Link>
        </div>
      </div>

      <div className="mt-6 text-center">
        <button onClick={onRebuild} className={`rounded text-[13px] font-medium text-gray-400 transition-colors hover:text-[#1e1813] ${FOCUS_RING}`}>
          Rebuild my arc
        </button>
      </div>
    </div>
  )
}
