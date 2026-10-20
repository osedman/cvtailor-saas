"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import type { CareerProfileSections } from "@/lib/anthropic"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import type { ShareSettings } from "@/lib/career-arc-share"
import { buildShareCards, type ShareCard } from "@/lib/career-arc-cards"

/**
 * Share-card strip for the share modal (stage 4, screen 04).
 * The SVG preview and the canvas rasteriser draw from the same card model and
 * the same layout constants, so the PNG is exactly the preview at 1080×1080.
 */

const SIZE = 1080
const CORAL = "#dc4f33"
const PEACH = "#f4a58e"
const CREAM = "#f9f6f0"
const GRAY = "#8a8178"
const CARD_BG = "#16120e"
const FONT_SANS = "Geist, system-ui, sans-serif"
const FONT_MONO = "'Geist Mono', ui-monospace, monospace"

// Vertical rhythm (1080-card px)
const Y_EYEBROW = 128
const Y_NAME = 186
const Y_SUB = 806
const Y_CHIP = 872
const Y_FOOT = 1006
const X_PAD = 72

function bigLineYs(card: ShareCard): number[] {
  const lineHeight = card.bigSize * 1.08
  const mid = 500
  const start = mid - ((card.big.length - 1) * lineHeight) / 2
  return card.big.map((_, i) => start + i * lineHeight)
}

function pathD(card: ShareCard): { solid: string; dashed: string } {
  const nodes = card.pathNodes!
  let d = `M ${nodes[0].x - 80} ${nodes[0].y} H ${nodes[0].x}`
  for (let i = 1; i < nodes.length; i++) {
    const riser = Math.min(60, (nodes[i].x - nodes[i - 1].x) * 0.35)
    d += ` H ${Math.round(nodes[i].x - riser)} L ${Math.round(nodes[i].x - riser / 2.4)} ${nodes[i].y} H ${nodes[i].x}`
  }
  const last = nodes[nodes.length - 1]
  return { solid: d, dashed: `M ${last.x} ${last.y} Q ${last.x + 44} ${last.y - 26} ${last.x + 84} ${last.y - 48}` }
}

export function CardSvg({ card, width }: { card: ShareCard; width: number }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={width} height={width} role="img" aria-label={`Share card: ${card.eyebrow}`}>
      <defs>
        <radialGradient id={`bg-${card.id}`} cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#2b1d15" />
          <stop offset="65%" stopColor={CARD_BG} />
        </radialGradient>
      </defs>
      <rect width={SIZE} height={SIZE} rx={40} fill={`url(#bg-${card.id})`} stroke="rgba(249,246,240,0.14)" strokeWidth={2} />
      <text x={SIZE / 2} y={Y_EYEBROW} textAnchor="middle" fill={GRAY} fontFamily={FONT_MONO} fontSize={26} letterSpacing="0.32em">{card.eyebrow}</text>
      {card.name && (
        <text x={SIZE / 2} y={Y_NAME} textAnchor="middle" fill={CREAM} fontFamily={FONT_MONO} fontSize={30} letterSpacing="0.26em">{card.name}</text>
      )}
      {card.pathNodes ? (
        <g>
          <path d={pathD(card).solid} fill="none" stroke={CORAL} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathD(card).dashed} fill="none" stroke={CORAL} strokeWidth={16} strokeLinecap="round" strokeDasharray="2 40" opacity={0.6} />
          {card.pathNodes.map((n, i) =>
            n.isCurrent ? (
              <g key={i}>
                <circle cx={n.x} cy={n.y} r={26} fill={CORAL} />
                <circle cx={n.x} cy={n.y} r={46} fill="none" stroke={CORAL} strokeWidth={5} opacity={0.4} />
              </g>
            ) : (
              <circle key={i} cx={n.x} cy={n.y} r={20} fill={CARD_BG} stroke={CORAL} strokeWidth={12} />
            ),
          )}
        </g>
      ) : (
        bigLineYs(card).map((y, i) => {
          const isLast = i === card.big.length - 1
          return (
            <text
              key={i} x={SIZE / 2} y={y} textAnchor="middle" fill={CREAM}
              fontFamily={FONT_SANS} fontSize={card.bigSize} fontWeight={900} letterSpacing="-0.01em"
              style={{ textShadow: "0 0 50px rgba(220,79,51,0.4)" }}
            >
              {card.big[i]}
              {isLast && card.coralDot && <tspan fill={CORAL}>.</tspan>}
            </text>
          )
        })
      )}
      <text x={SIZE / 2} y={Y_SUB} textAnchor="middle" fill={PEACH} fontFamily={FONT_MONO} fontSize={24} letterSpacing="0.18em">{card.sub}</text>
      <g>
        <rect
          x={SIZE / 2 - (card.chip.length * 12.2 + 60) / 2} y={Y_CHIP - 34} width={card.chip.length * 12.2 + 60} height={52}
          rx={26} fill="none" stroke="rgba(249,246,240,0.3)" strokeWidth={2}
        />
        <text x={SIZE / 2} y={Y_CHIP} textAnchor="middle" fill={CREAM} fontFamily={FONT_MONO} fontSize={20} letterSpacing="0.12em">{card.chip}</text>
      </g>
      <text x={X_PAD} y={Y_FOOT} fill={GRAY} fontFamily={FONT_MONO} fontSize={21} letterSpacing="0.12em">{card.footLeft}</text>
      <text x={SIZE - X_PAD} y={Y_FOOT} textAnchor="end" fill={GRAY} fontFamily={FONT_MONO} fontSize={21} letterSpacing="0.12em">{card.footRight}</text>
    </svg>
  )
}

async function rasterise(card: ShareCard): Promise<Blob> {
  await document.fonts.ready
  await Promise.all([
    document.fonts.load(`900 ${card.bigSize || 72}px Geist`),
    document.fonts.load("400 26px 'Geist Mono'"),
  ]).catch(() => {})

  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext("2d")!

  // Background: ink base + elliptical warm glow, inside rounded bounds.
  ctx.beginPath()
  ctx.roundRect(0, 0, SIZE, SIZE, 40)
  ctx.clip()
  ctx.fillStyle = CARD_BG
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.save()
  ctx.translate(SIZE / 2, SIZE * 0.3)
  ctx.scale(1, 0.64)
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, SIZE * 0.75)
  glow.addColorStop(0, "#2b1d15")
  glow.addColorStop(1, "rgba(43,29,21,0)")
  ctx.fillStyle = glow
  ctx.fillRect(-SIZE, -SIZE, SIZE * 2, SIZE * 2)
  ctx.restore()
  ctx.strokeStyle = "rgba(249,246,240,0.14)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(2, 2, SIZE - 4, SIZE - 4, 38)
  ctx.stroke()

  const spaced = (text: string, x: number, y: number, font: string, fill: string, tracking: number, align: CanvasTextAlign = "center") => {
    ctx.font = font
    ctx.fillStyle = fill
    ctx.textAlign = align
    try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tracking}px` } catch { /* older engines */ }
    ctx.fillText(text, x, y)
    try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px" } catch { /* older engines */ }
  }

  spaced(card.eyebrow, SIZE / 2, Y_EYEBROW, "400 26px 'Geist Mono', monospace", GRAY, 8.3)
  if (card.name) spaced(card.name, SIZE / 2, Y_NAME, "400 30px 'Geist Mono', monospace", CREAM, 7.8)

  if (card.pathNodes) {
    const { solid, dashed } = pathD(card)
    ctx.strokeStyle = CORAL
    ctx.lineWidth = 16
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.stroke(new Path2D(solid))
    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.setLineDash([2, 40])
    ctx.stroke(new Path2D(dashed))
    ctx.restore()
    for (const n of card.pathNodes) {
      ctx.beginPath()
      if (n.isCurrent) {
        ctx.fillStyle = CORAL
        ctx.arc(n.x, n.y, 26, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.strokeStyle = CORAL
        ctx.lineWidth = 5
        ctx.globalAlpha = 0.4
        ctx.arc(n.x, n.y, 46, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = CARD_BG
        ctx.strokeStyle = CORAL
        ctx.lineWidth = 12
        ctx.arc(n.x, n.y, 20, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  } else {
    ctx.shadowColor = "rgba(220,79,51,0.4)"
    ctx.shadowBlur = 50
    const ys = bigLineYs(card)
    card.big.forEach((line, i) => {
      const isLast = i === card.big.length - 1
      ctx.font = `900 ${card.bigSize}px Geist, sans-serif`
      ctx.textAlign = "center"
      if (isLast && card.coralDot) {
        const lineW = ctx.measureText(line).width
        const dotW = ctx.measureText(".").width
        ctx.fillStyle = CREAM
        ctx.textAlign = "left"
        ctx.fillText(line, SIZE / 2 - (lineW + dotW) / 2, ys[i])
        ctx.fillStyle = CORAL
        ctx.fillText(".", SIZE / 2 - (lineW + dotW) / 2 + lineW, ys[i])
      } else {
        ctx.fillStyle = CREAM
        ctx.fillText(line, SIZE / 2, ys[i])
      }
    })
    ctx.shadowBlur = 0
  }

  spaced(card.sub, SIZE / 2, Y_SUB, "400 24px 'Geist Mono', monospace", PEACH, 4.3)

  const chipW = card.chip.length * 12.2 + 60
  ctx.strokeStyle = "rgba(249,246,240,0.3)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(SIZE / 2 - chipW / 2, Y_CHIP - 34, chipW, 52, 26)
  ctx.stroke()
  spaced(card.chip, SIZE / 2, Y_CHIP, "400 20px 'Geist Mono', monospace", CREAM, 2.4)

  spaced(card.footLeft, X_PAD, Y_FOOT, "400 21px 'Geist Mono', monospace", GRAY, 2.5, "left")
  spaced(card.footRight, SIZE - X_PAD, Y_FOOT, "400 21px 'Geist Mono', monospace", GRAY, 2.5, "right")

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Rasterisation failed"))), "image/png")
  })
}

function savePng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function ShareCardsStrip({
  sections, evidence, settings,
}: {
  sections: CareerProfileSections
  evidence: EvidenceRow[]
  settings: ShareSettings
}) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const cards = useMemo(() => buildShareCards({ sections, evidence, settings }), [sections, evidence, settings])

  const download = async (card: ShareCard) => {
    setDownloading(card.id)
    try {
      savePng(await rasterise(card), `tailr-arc-${card.id}.png`)
    } catch {
      toast.error("Couldn't render that card — try a different browser.")
    } finally {
      setDownloading(null)
    }
  }

  const downloadAll = async () => {
    setDownloading("all")
    try {
      for (const card of cards) {
        savePng(await rasterise(card), `tailr-arc-${card.id}.png`)
        await new Promise((r) => setTimeout(r, 350))
      }
      toast.success(`${cards.length} cards downloaded — redactions applied.`)
    } catch {
      toast.error("Couldn't render the card set — try a different browser.")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => download(card)}
            disabled={downloading !== null}
            aria-label={`Download ${card.eyebrow} card as PNG`}
            className="group relative overflow-hidden rounded-xl transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            <CardSvg card={card} width={132} />
            <span className="absolute inset-x-0 bottom-0 bg-[rgba(30,24,19,0.85)] py-1 text-center font-mono text-[8.5px] tracking-[0.14em] text-[#f9f6f0] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {downloading === card.id ? "RENDERING…" : "↓ PNG"}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={downloadAll}
          disabled={downloading !== null}
          className="rounded-[10px] border bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#1e1813] transition-colors hover:border-[#dc4f33] focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1 disabled:opacity-50"
          style={{ borderColor: "#e0d6c9" }}
        >
          {downloading === "all" ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rendering…</span>
          ) : (
            `Download cards (${cards.length})`
          )}
        </button>
        <span className="text-[11.5px] text-[#a89e93]">1080×1080 PNG · your redactions applied · LinkedIn &amp; IG ready</span>
      </div>
    </div>
  )
}
