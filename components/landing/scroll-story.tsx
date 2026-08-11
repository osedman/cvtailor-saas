"use client"

// Scroll-driven "how it works" story: a pinned 3D card scene on desktop,
// a static four-beat layout on small screens and for reduced motion.
// All motion is CSS 3D transforms driven by scroll progress; no WebGL, no deps.

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

const QUESTIONS = [
  "Tell us about a delivery you rescued when the timeline slipped.",
  "How do you keep stakeholders aligned when priorities conflict?",
  "Walk us through a decision you made with incomplete data.",
  "Where would you improve our onboarding funnel first?",
]

const STEPS = [
  {
    n: "01", a: 0.10, b: 0.30, t: "Tailor your CV.",
    d: "Tailr rewrites your CV for the exact role, in about 30 seconds, with ATS safe output.",
  },
  {
    n: "02", a: 0.30, b: 0.50, t: "See your match score.",
    d: "Evidence based scoring against the job description, requirement by requirement.",
  },
  {
    n: "03", a: 0.50, b: 0.72, t: "Prepare for interviews.",
    d: "Nine likely questions predicted from your tailored CV and the role.",
  },
  {
    n: "04", a: 0.72, b: 0.945, t: "Track every application.",
    d: "Every version, score and stage in one place. Nothing slips.",
  },
]

const BEATS: [number, number][] = [[0.10, 0.30], [0.30, 0.50], [0.50, 0.72], [0.72, 0.945]]

// Board slots for the application cards (satellites 4 to 7); question cards
// leave the scene during the scatter.
const BOARD_META = [
  { col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 0 },
]

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; o: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const seg = (p: number, a: number, b: number) => ease(clamp((p - a) / (b - a), 0, 1))
const mixPose = (A: Pose, B: Pose, t: number): Pose => ({
  x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), z: lerp(A.z, B.z, t),
  rx: lerp(A.rx, B.rx, t), ry: lerp(A.ry, B.ry, t), rz: lerp(A.rz, B.rz, t),
  s: lerp(A.s, B.s, t), o: lerp(A.o, B.o, t),
})

const SCATTER: [number, number, number, number, number, number][] = [
  [-320, -170, 120, -14, 25, -9], [300, -190, 60, 12, -20, 7],
  [-360, 120, 180, 10, 30, 12], [380, 150, 90, -12, -28, -8],
  [-160, -240, 40, 18, 12, 15], [190, 230, 150, -16, 18, -12],
  [-420, -20, 220, 8, -35, 5], [430, -60, 30, -8, 22, 10],
]

export function ScrollStory() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T | null
    const qa = <T extends HTMLElement>(sel: string) => Array.from(root.querySelectorAll(sel)) as T[]

    const track = q<HTMLDivElement>("[data-track]")
    const stage = q<HTMLDivElement>("[data-stage]")
    const hero = q<HTMLDivElement>("[data-hero-card]")
    if (!track || !stage || !hero) return

    const sats = qa<HTMLDivElement>("[data-sat]")
    const cvFace = q<HTMLDivElement>("[data-face-cv]")
    const scoreFace = q<HTMLDivElement>("[data-face-score]")
    const tlLines = qa<HTMLDivElement>("[data-tailored-line]")
    const chipRows = qa<HTMLDivElement>("[data-chip-row]")
    const verdicts = q<HTMLDivElement>("[data-verdicts]")
    const ringArc = q<SVGCircleElement & HTMLElement>("[data-ring-arc]")
    const ringNum = q<HTMLElement>("[data-ring-num]")
    const chrome = q<HTMLDivElement>("[data-board-chrome]")
    const colHeads = qa<HTMLDivElement>("[data-col-head]")
    const toast = q<HTMLDivElement>("[data-toast]")
    const caps = qa<HTMLDivElement>("[data-cap]")
    const dots = qa<HTMLButtonElement>("[data-dot]")
    const endCta = q<HTMLDivElement>("[data-end-cta]")

    let K = 1
    let CX = 0
    const layout = () => {
      const w = stage.clientWidth || 1
      K = clamp(w / 1250, 0.62, 1)
      CX = w > 1180 ? 120 : 60
    }

    const deckPose = (i: number): Pose =>
      ({ x: CX, y: 56 - i * 15, z: i * 4, rx: -56, ry: 0, rz: -7 + (i % 3) * 2.4, s: 1, o: 1 })
    const ringPose = (i: number, spin: number): Pose => {
      let a = (i / 8) * 360 + spin
      a = ((a % 360) + 360) % 360
      const rad = (a * Math.PI) / 180
      const R = 300 * K
      return {
        x: CX + Math.sin(rad) * R, y: -6, z: Math.cos(rad) * R - R - 60,
        rx: 0, ry: ((a + 180) % 360) - 180, rz: 0, s: 0.92, o: 1,
      }
    }
    const scatterPose = (i: number): Pose => {
      const j = SCATTER[i]
      return { x: CX + j[0] * K, y: j[1] * K, z: j[2], rx: j[3], ry: j[4], rz: j[5], s: 0.85, o: 1 }
    }
    const boardPose = (col: number, row: number): Pose =>
      ({ x: CX + (col - 1) * 250 * K, y: -46 + row * 150 * K, z: 0, rx: 0, ry: 0, rz: 0, s: 0.58, o: 1 })
    const gonePose = (i: number): Pose => {
      const p = scatterPose(i)
      return { ...p, o: 0, s: 0.6, z: p.z - 200 }
    }

    const apply = (el: HTMLElement, P: Pose) => {
      el.style.transform =
        `translate3d(${P.x}px,${P.y}px,${P.z}px) rotateX(${P.rx}deg) rotateY(${P.ry}deg) rotateZ(${P.rz}deg) scale(${P.s})`
      el.style.opacity = String(P.o)
      el.style.zIndex = String(1000 + Math.round(P.z))
    }

    const render = (p: number) => {
      const deckTop = deckPose(8)
      const center: Pose = { x: CX, y: -26, z: 150, rx: 0, ry: 0, rz: 0, s: 1.14, o: 1 }
      const tilt: Pose = { ...center, rx: -7, s: 1.16 }
      const dock: Pose = { x: CX, y: 96 * K + 60, z: 200, rx: 6, ry: 0, rz: 0, s: 0.82, o: 1 }

      let H: Pose
      if (p < 0.10) H = deckTop
      else if (p < 0.30) H = mixPose(deckTop, center, seg(p, 0.10, 0.24))
      else if (p < 0.50) H = mixPose(center, tilt, seg(p, 0.30, 0.40))
      else if (p < 0.60) H = mixPose(tilt, dock, seg(p, 0.50, 0.60))
      else if (p < 0.72) H = dock
      else if (p < 0.80) H = mixPose(dock, scatterPose(4), seg(p, 0.72, 0.80))
      else if (p < 0.92) H = mixPose(scatterPose(4), boardPose(1, 0), seg(p, 0.80, 0.92))
      else H = boardPose(1, 0)
      if (p >= 0.92) H = { ...H, y: H.y - 24 * seg(p, 0.92, 1) }
      apply(hero, H)
      hero.dataset.landed = p > 0.87 ? "true" : "false"

      if (cvFace) cvFace.style.opacity = String(1 - seg(p, 0.30, 0.38))
      if (scoreFace) scoreFace.style.opacity = String(seg(p, 0.33, 0.44))
      const draw = seg(p, 0.14, 0.28)
      tlLines.forEach((el, i) => {
        el.style.transformOrigin = "left"
        el.style.transition = "transform .35s"
        el.style.transform = `scaleX(${i / tlLines.length <= draw ? 1 : 0})`
      })
      const ringT = seg(p, 0.34, 0.48)
      if (ringArc) ringArc.style.strokeDashoffset = String(169.6 * (1 - 0.87 * ringT))
      if (ringNum) ringNum.textContent = String(Math.round(87 * ringT))
      chipRows.forEach((el, i) => {
        const t = seg(p, 0.36 + i * 0.025, 0.44 + i * 0.025)
        el.style.opacity = String(t)
        el.style.transform = `translateX(${10 * (1 - t)}px)`
      })
      if (verdicts) verdicts.style.opacity = String(seg(p, 0.46, 0.50))

      const spin = -135 * seg(p, 0.56, 0.72)
      sats.forEach((el, i) => {
        let P: Pose
        const settled: Pose = { ...deckPose(i), y: deckPose(i).y + 10 }
        if (p < 0.30) P = deckPose(i)
        else if (p < 0.50) P = mixPose(deckPose(i), settled, seg(p, 0.30, 0.36))
        else if (p < 0.60) P = mixPose(settled, ringPose(i, spin), seg(p, 0.50, 0.60))
        else if (p < 0.72) P = ringPose(i, spin)
        else if (p < 0.80) P = mixPose(ringPose(i, spin), scatterPose(i), seg(p, 0.72, 0.80))
        else if (i >= 4) {
          const m = BOARD_META[i - 4]
          P = mixPose(scatterPose(i), boardPose(m.col, m.row), seg(p, 0.80, 0.92))
        } else {
          P = mixPose(scatterPose(i), gonePose(i), seg(p, 0.80, 0.90))
        }
        if (p >= 0.92) P = { ...P, y: P.y - 24 * seg(p, 0.92, 1) }
        apply(el, P)
      })

      const bIn = seg(p, 0.84, 0.92)
      if (chrome) chrome.style.opacity = String(bIn)
      const cw = stage.clientWidth / 2
      const ch = stage.clientHeight / 2
      colHeads.forEach((el) => {
        const col = Number(el.dataset.colHead)
        el.style.left = `${cw + CX + (col - 1) * 250 * K}px`
        el.style.top = `${ch - 46 - 96 * K - 24 * seg(p, 0.92, 1)}px`
      })
      if (toast) {
        toast.style.left = `${cw + CX + 96 * K}px`
        toast.style.top = `${ch - 46 + 58 * K - 24 * seg(p, 0.92, 1)}px`
        const tIn = seg(p, 0.88, 0.93)
        toast.style.opacity = String(tIn)
        toast.style.transform = `translate(-50%,-50%) translateY(${8 * (1 - tIn)}px)`
      }

      caps.forEach((el) => {
        const win = el.dataset.cap!.split(",").map(Number)
        const w = win[1] - win[0]
        const vis = seg(p, win[0], win[0] + w * 0.18) * (1 - seg(p, win[1] - w * 0.14, win[1]))
        el.style.opacity = String(vis)
        el.style.transform = `translateY(calc(-50% + ${18 * (1 - vis)}px))`
      })

      dots.forEach((d, i) => {
        d.dataset.on = p >= BEATS[i][0] && p < BEATS[i][1] ? "true" : "false"
      })
      if (endCta) {
        const cIn = seg(p, 0.94, 1)
        endCta.style.opacity = String(cIn)
        endCta.style.transform = `translateX(-50%) translateY(${16 * (1 - cIn)}px)`
        endCta.style.pointerEvents = cIn > 0.5 ? "auto" : "none"
      }
    }

    let raf = 0
    let target = 0
    let cur = -1
    const frame = () => {
      // The track is display:none on small screens and under reduced motion;
      // skip work entirely until it is visible.
      if (track.offsetParent !== null) {
        const vh = window.innerHeight
        const h = track.offsetHeight - vh
        target = h > 0 ? clamp((window.scrollY - track.offsetTop) / h, 0, 1) : 0
        if (Math.abs(target - cur) > 0.0004) {
          cur = cur < 0 ? target : lerp(cur, target, 0.16)
          render(cur)
        }
      }
      raf = requestAnimationFrame(frame)
    }

    const onResize = () => { layout(); cur = -1 }
    layout()
    window.addEventListener("resize", onResize)
    raf = requestAnimationFrame(frame)

    dots.forEach((d, i) => {
      d.addEventListener("click", () => {
        const vh = window.innerHeight
        const h = track.offsetHeight - vh
        window.scrollTo({ top: track.offsetTop + ((BEATS[i][0] + BEATS[i][1]) / 2) * h, behavior: "smooth" })
      })
    })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <section ref={rootRef} id="how-it-works" aria-label="How Tailr works">

      {/* ── Pinned scene: desktop with motion allowed ── */}
      <div data-track className="relative hidden motion-safe:lg:block" style={{ height: "480vh" }}>
        <div
          data-stage
          className="sticky top-0 h-screen overflow-hidden"
          style={{ background: "radial-gradient(1200px 600px at 68% 42%, #fff7f4 0%, rgba(255,247,244,0) 60%), #fff" }}
        >
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 w-0 h-0" style={{ perspective: 1400, perspectiveOrigin: "50% 46%" }}>
            <div className="absolute left-0 top-0" style={{ transformStyle: "preserve-3d" }}>

              {/* Hero card: Alex Morgan's CV, then the tailored result */}
              <div
                data-hero-card
                className="absolute left-0 top-0 w-[330px] h-[214px] -ml-[165px] -mt-[107px] rounded-2xl border bg-white p-4 overflow-hidden transition-[border-color,box-shadow] duration-300 border-gray-200 shadow-[0_40px_90px_rgba(30,24,19,0.16),0_8px_22px_rgba(30,24,19,0.08)] data-[landed=true]:border-[#ffd8cd] data-[landed=true]:shadow-[0_20px_50px_rgba(220,79,51,0.18),0_4px_14px_rgba(30,24,19,0.08)]"
                style={{ willChange: "transform", backfaceVisibility: "hidden", zIndex: 1005 }}
              >
                <div data-face-cv className="absolute inset-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: ACCENT }}>Your CV</span>
                    <span className="text-[9px] text-gray-500 border border-gray-100 rounded px-1.5 py-0.5" style={{ fontFamily: "var(--font-jetbrains)" }}>cv-alex-morgan.pdf</span>
                  </div>
                  <div className="flex flex-col gap-[9px]">
                    {[
                      ["52%", false], ["78%", true], ["64%", false], ["84%", true],
                      ["58%", true], ["70%", false], ["44%", true],
                    ].map(([w, tinted], i) => (
                      <div
                        key={i}
                        data-tailored-line={tinted ? "" : undefined}
                        className="h-2 rounded-full"
                        style={{ width: w as string, background: tinted ? "#ffd8cd" : "#eceae6" }}
                      />
                    ))}
                  </div>
                </div>
                <div data-face-score className="absolute inset-4" style={{ opacity: 0 }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">Tailored result</span>
                      <div className="flex flex-col gap-1.5 mt-2.5">
                        {[
                          ["Strong", "#dcfce7", "#16a34a", "Stakeholder management"],
                          ["Strong", "#dcfce7", "#16a34a", "SQL and data analysis"],
                          ["Transferable", "#ffeae4", ACCENT, "Media platform delivery"],
                          ["Partial", "#fdf2d9", "#9a6b00", "Team leadership"],
                        ].map(([label, bg, color, req]) => (
                          <div key={label + req} data-chip-row className="flex items-center gap-2" style={{ opacity: 0 }}>
                            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg, color }}>{label}</span>
                            <span className="text-[10.5px] text-gray-500">{req}</span>
                          </div>
                        ))}
                      </div>
                      <div data-verdicts className="flex gap-1.5 mt-2.5" style={{ opacity: 0 }}>
                        <span className="text-[9px] font-semibold text-white rounded-md px-2 py-1" style={{ background: ACCENT }}>Tailored in 28s</span>
                        <span className="text-[9px] font-semibold rounded-md px-2 py-1" style={{ background: "#dcfce7", color: "#16a34a" }}>&#10003; ATS pass</span>
                      </div>
                    </div>
                    <div className="relative w-16 h-16">
                      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                        <circle cx="32" cy="32" r="27" fill="none" stroke="#eceae6" strokeWidth="5" />
                        <circle data-ring-arc cx="32" cy="32" r="27" fill="none" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" strokeDasharray="169.6" strokeDashoffset="169.6" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                        <b data-ring-num className="text-[17px] font-extrabold tabular-nums">0</b>
                        <span className="text-[6.5px] uppercase tracking-[0.18em] text-gray-400 mt-0.5">match</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Satellites: 4 interview prep cards, then 4 application cards */}
              {QUESTIONS.map((question, i) => (
                <div
                  key={question}
                  data-sat
                  className="absolute left-0 top-0 w-[330px] h-[214px] -ml-[165px] -mt-[107px] rounded-2xl border border-gray-200 bg-white p-4 overflow-hidden shadow-[0_30px_60px_rgba(30,24,19,0.12),0_6px_16px_rgba(30,24,19,0.06)]"
                  style={{ willChange: "transform", backfaceVisibility: "hidden" }}
                >
                  <span className="block text-[8.5px] font-bold uppercase tracking-[0.13em] mb-2.5" style={{ color: ACCENT }}>Interview prep</span>
                  <p className="text-[13.5px] font-semibold leading-[1.45] tracking-[-0.01em]">{question}</p>
                  <span className="absolute right-4 bottom-3 text-[10px] text-gray-400" style={{ fontFamily: "var(--font-jetbrains)" }}>Q{i + 2} / 9</span>
                </div>
              ))}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={`app-${i}`}
                  data-sat
                  className="absolute left-0 top-0 w-[330px] h-[214px] -ml-[165px] -mt-[107px] rounded-2xl border border-gray-200 bg-white p-4 overflow-hidden shadow-[0_30px_60px_rgba(30,24,19,0.12),0_6px_16px_rgba(30,24,19,0.06)]"
                  style={{ willChange: "transform", backfaceVisibility: "hidden" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">Application</span>
                    <span className="text-[9px] text-gray-500 border border-gray-100 rounded px-1.5 py-0.5" style={{ fontFamily: "var(--font-jetbrains)" }}>v{i + 7}</span>
                  </div>
                  <div className="flex flex-col gap-[9px]">
                    {[72, 58, 80, 49, 66].map((w, k) => (
                      <div key={k} className="h-2 rounded-full" style={{ width: `${w}%`, background: "#eceae6" }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Board chrome: column headers + toast, positioned per frame */}
          <div data-board-chrome aria-hidden="true" className="absolute left-0 top-0" style={{ opacity: 0 }}>
            {["Applied", "Interview", "Offer"].map((name, col) => (
              <div key={name} data-col-head={col} className="absolute w-[200px] -translate-x-1/2 -translate-y-1/2 text-center">
                <b className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">{name}</b>
                <i className="not-italic text-[9px] text-gray-400 ml-1.5" style={{ fontFamily: "var(--font-jetbrains)" }}>{[2, 2, 1][col]}</i>
                <span className="block h-px bg-gray-200 mt-2" />
              </div>
            ))}
            <div data-toast className="absolute flex items-center gap-2 whitespace-nowrap rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-[0_16px_40px_rgba(30,24,19,0.14)]" style={{ opacity: 0, transform: "translate(-50%,-50%)" }}>
              <span className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center" style={{ background: "#ffeae4", color: ACCENT }}>
                <Check className="w-3 h-3" />
              </span>
              <span>
                <b className="block text-[11.5px]">Moved to Interview</b>
                <span className="block text-[10px] text-gray-500 mt-px">Senior BA &middot; StreamCo</span>
              </span>
            </div>
          </div>

          {/* Step captions */}
          <div className="absolute z-10 top-1/2 -translate-y-1/2 w-[330px] pointer-events-none" style={{ left: "min(6vw, 84px)" }}>
            <div data-cap="0,0.10" className="absolute left-0 top-0" style={{ opacity: 0, transform: "translateY(-50%)" }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-3.5" style={{ color: ACCENT }}>How Tailr works</p>
              <h2 className="text-[34px] font-extrabold tracking-[-0.03em] leading-[1.08] mb-3" style={{ color: INK, textWrap: "balance" }}>One CV, ready for every application.</h2>
              <p className="text-[15.5px] text-gray-500 leading-relaxed max-w-[30ch]">Follow a single application from upload to interview.</p>
            </div>
            {STEPS.map((s) => (
              <div key={s.n} data-cap={`${s.a},${s.b}`} className="absolute left-0 top-0" style={{ opacity: 0, transform: "translateY(-50%)" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-3.5" style={{ color: ACCENT }}>
                  Step {Number(s.n)} <span className="font-medium text-gray-400" style={{ fontFamily: "var(--font-jetbrains)" }}>/ 04</span>
                </p>
                <h2 className="text-[34px] font-extrabold tracking-[-0.03em] leading-[1.08] mb-3" style={{ color: INK, textWrap: "balance" }}>{s.t}</h2>
                <p className="text-[15.5px] text-gray-500 leading-relaxed max-w-[30ch]">{s.d}</p>
              </div>
            ))}
          </div>

          {/* Progress dots */}
          <div className="absolute z-10 top-1/2 -translate-y-1/2 flex flex-col gap-3.5" style={{ right: "min(4vw, 52px)" }}>
            {BEATS.map((_, i) => (
              <button
                key={i}
                data-dot
                aria-label={`Go to step ${i + 1}`}
                className="w-2 h-2 rounded-full border-0 cursor-pointer p-0 transition-all duration-200 bg-gray-200 data-[on=true]:bg-[#dc4f33] data-[on=true]:scale-[1.4]"
                onFocus={(e) => { e.currentTarget.style.outline = `2px solid ${ACCENT}`; e.currentTarget.style.outlineOffset = "3px" }}
                onBlur={(e) => { e.currentTarget.style.outline = "" }}
              />
            ))}
          </div>

          {/* End CTA */}
          <div data-end-cta className="absolute z-10 left-1/2 flex items-center gap-3" style={{ bottom: "7vh", opacity: 0, pointerEvents: "none", transform: "translateX(-50%)" }}>
            <Link href="/tailor" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-[15px] font-semibold shadow-[0_10px_30px_rgba(220,79,51,0.35)] transition-all hover:brightness-105 active:scale-[0.98]" style={{ background: ACCENT }}>
              Tailor my CV <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#features" className="inline-flex items-center px-6 py-3 rounded-xl text-[15px] font-semibold border border-gray-200 bg-white transition-colors hover:border-gray-300" style={{ color: INK }}>
              Explore the features
            </a>
          </div>
        </div>
      </div>

      {/* ── Static fallback: small screens and reduced motion ── */}
      <div className="block motion-safe:lg:hidden py-20 px-5">
        <div className="max-w-xl mx-auto">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-center" style={{ color: ACCENT }}>How Tailr works</p>
          <h2 className="mt-3 text-center text-[clamp(28px,5vw,38px)] font-extrabold tracking-[-0.025em] leading-tight" style={{ color: INK }}>
            One CV, ready for every application.
          </h2>
          <div className="mt-10 flex flex-col divide-y divide-gray-100">
            {STEPS.map((s, i) => (
              <div key={s.n} className="py-9">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2.5" style={{ color: ACCENT }}>
                  Step {Number(s.n)} <span className="font-medium text-gray-400" style={{ fontFamily: "var(--font-jetbrains)" }}>/ 04</span>
                </p>
                <h3 className="text-[24px] font-extrabold tracking-[-0.025em] mb-1.5" style={{ color: INK }}>{s.t}</h3>
                <p className="text-[15px] text-gray-500 leading-relaxed mb-5">{s.d}</p>
                <StaticBeat index={i} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link href="/tailor" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-[15px] font-semibold" style={{ background: ACCENT }}>
              Tailor my CV <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// Static per-step visuals for the fallback layout.
function StaticBeat({ index }: { index: number }) {
  const frame = "relative h-[210px] rounded-2xl overflow-hidden border" as const
  const frameStyle = { background: "#fff7f4", borderColor: "#ffeae4" }
  const card = "absolute bg-white border border-gray-200 rounded-xl shadow-[0_14px_30px_rgba(30,24,19,0.10)]" as const

  if (index === 0) {
    return (
      <div className={frame} style={frameStyle} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${card} w-[190px] h-[120px] left-1/2 p-3`} style={{ top: 118 - i * 12, transform: `translateX(-50%) rotate(${-4 + i * 3}deg)`, zIndex: 3 - i }}>
            <div className="flex flex-col gap-2">
              {[["50%", false], ["76%", true], ["62%", false], ["44%", true]].map(([w, t], k) => (
                <div key={k} className="h-1.5 rounded-full" style={{ width: w as string, background: t ? "#ffd8cd" : "#eceae6" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className={frame} style={frameStyle} aria-hidden="true">
        <div className={`${card} w-[230px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3.5`}>
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-3 flex flex-col gap-2">
              {["80%", "55%"].map((w, k) => (
                <div key={k} className="h-1.5 rounded-full" style={{ width: w, background: "#eceae6" }} />
              ))}
              <div className="h-1.5 rounded-full" style={{ width: "70%", background: "#ffd8cd" }} />
            </div>
            <div className="text-center">
              <b className="text-[22px] font-extrabold" style={{ color: "#16a34a" }}>87</b>
              <div className="text-[7px] uppercase tracking-[0.18em] text-gray-400">match</div>
            </div>
          </div>
          <div className="flex gap-1.5 mt-3">
            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>Strong</span>
            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ffeae4", color: ACCENT }}>Transferable</span>
            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fdf2d9", color: "#9a6b00" }}>Partial</span>
          </div>
        </div>
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className={frame} style={frameStyle} aria-hidden="true">
        {QUESTIONS.slice(0, 3).map((question, i) => (
          <div key={question} className={`${card} w-[165px] h-[122px] p-3`} style={{ left: `${14 + i * 27}%`, top: 44 + (i % 2) * 22, transform: `rotate(${-5 + i * 5}deg)`, zIndex: i }}>
            <span className="block text-[8px] font-bold uppercase tracking-[0.13em] mb-1.5" style={{ color: ACCENT }}>Interview prep</span>
            <p className="text-[10.5px] font-semibold leading-snug">{question.slice(0, 58)}&hellip;</p>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={frame} style={frameStyle} aria-hidden="true">
      {["Applied", "Interview", "Offer"].map((name, i) => (
        <div key={name} className="absolute w-[27%]" style={{ left: `${8 + i * 31.5}%`, top: 16 }}>
          <b className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">{name}</b>
          {Array.from({ length: i === 0 ? 3 : i === 1 ? 2 : 1 }).map((_, r) => (
            <div
              key={r}
              className="h-[34px] bg-white rounded-lg mt-2 border shadow-[0_6px_14px_rgba(30,24,19,0.06)]"
              style={{ borderColor: i === 1 && r === 0 ? "#ffd8cd" : "#eceae6" }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
