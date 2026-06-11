"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Newsreader, Hanken_Grotesk, JetBrains_Mono } from "next/font/google"
import "./landing.css"

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
})
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
  weight: ["400", "500", "600", "700"],
})
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
})

// ── hooks ────────────────────────────────────────────────────────────

function useInView(opts = { threshold: 0.18 }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fallback = setTimeout(() => setSeen(true), 1400)
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); clearTimeout(fallback); io.disconnect() }
    }, opts)
    io.observe(el)
    const r = el.getBoundingClientRect()
    if (r.top < (window.innerHeight || 800)) setSeen(true)
    return () => { io.disconnect(); clearTimeout(fallback) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return [ref, seen] as const
}

function useCountUp(target: number, run: boolean, dur = 1600) {
  const [v, setV] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (!run || started.current) return
    started.current = true
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) { setV(target); return }
    let raf: number, t0: number
    const tick = (t: number) => {
      if (!t0) t0 = t
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setV(target * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, target, dur])
  return v
}

// ── tiny components ──────────────────────────────────────────────────

function Reveal({ children, delay = 0, style = {}, className = "" }: {
  children: React.ReactNode; delay?: number; style?: React.CSSProperties; className?: string
}) {
  const [ref, seen] = useInView()
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const hidden = !seen && !reduce
  return (
    <div ref={ref} className={className} style={{
      opacity: hidden ? 0 : 1,
      transform: hidden ? "translateY(18px)" : "none",
      transition: "opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)",
      transitionDelay: (seen ? delay : 0) + "ms",
      ...style
    }}>
      {children}
    </div>
  )
}

function Wordmark() {
  return (
    <a href="#top" style={{ display: "inline-flex", alignItems: "baseline", gap: 2,
      fontFamily: "var(--font-newsreader), Georgia, serif",
      fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em" }}>
      tailr
      <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--thread)", display: "inline-block",
        transform: "translateY(-1px)" }} />
    </a>
  )
}

function TrustRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex" }}>
        {(["#c98a5b","#7d9a8b","#b06a6a","#8a86b0"] as const).map((c, i) => (
          <span key={i} style={{ width: 30, height: 30, borderRadius: 99, background: c,
            border: "2px solid var(--paper)", marginLeft: i ? -9 : 0, display: "grid",
            placeItems: "center", color: "#fff", fontSize: 12, fontWeight: 700,
            fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            {["A","J","M","K"][i]}
          </span>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4 }}>
        <strong style={{ color: "var(--ink)" }}>40,000+</strong> CVs tailored ·{" "}
        <span style={{ color: "var(--thread-deep)" }}>★★★★★</span> 4.9
      </div>
    </div>
  )
}

function MatchRing({ score = 92, run = true, size = 96, stroke = 8, label = "Match" }: {
  score?: number; run?: boolean; size?: number; stroke?: number; label?: string
}) {
  const v = useCountUp(score, run)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - v / 100)
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--thread)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset .1s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
        <span className="serif tnum" style={{ fontSize: size * 0.32, fontWeight: 600 }}>{Math.round(v)}</span>
        {label && <span className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--ink-faint)", marginTop: 3 }}>{label}</span>}
      </div>
    </div>
  )
}

function CvDoc({ tailored = false, animate = false }: { tailored?: boolean; animate?: boolean }) {
  const tinted = [1, 3, 6, 8, 9]
  const [lit, setLit] = useState(tailored)
  useEffect(() => {
    if (!animate) { setLit(tailored); return }
    setLit(false)
    const t = setTimeout(() => setLit(true), 350)
    return () => clearTimeout(t)
  }, [animate, tailored])

  const Line = ({ w, i, h = 7 }: { w: string; i: number; h?: number }) => (
    <div className={"doc-line" + (lit && tinted.includes(i) ? " tinted" : "")}
      style={{ width: w, height: h }} />
  )

  return (
    <div className="doc thin-scroll" style={{ padding: 26, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="doc-name">Alex Rivera</div>
          <div className="doc-meta" style={{ marginTop: 4 }}>Product Marketing Manager</div>
        </div>
        <div className="doc-meta" style={{ textAlign: "right", lineHeight: 1.5 }}>
          alex@rivera.co<br/>London, UK
        </div>
      </div>
      <div className="doc-rule" style={{ margin: "16px 0" }} />
      <div className="doc-h">Summary</div>
      <div style={{ display: "grid", gap: 7, margin: "9px 0 18px" }}>
        <Line w="100%" i={0} /><Line w="92%" i={1} /><Line w="74%" i={2} />
      </div>
      <div className="doc-h">Experience</div>
      <div style={{ display: "grid", gap: 7, margin: "9px 0 18px" }}>
        <Line w="60%" i={3} h={8} />
        <Line w="100%" i={4} /><Line w="96%" i={5} /><Line w="88%" i={6} />
        <Line w="52%" i={7} h={8} />
        <Line w="100%" i={8} /><Line w="80%" i={9} />
      </div>
      <div className="doc-h">Skills</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {["Positioning","GTM","Lifecycle","SQL","Figma","A/B testing"].map((s, i) => (
          <span key={s} style={{
            fontFamily: "var(--font-jetbrains), ui-monospace, monospace", fontSize: 9, padding: "3px 8px",
            borderRadius: 99, border: "1px solid var(--line)",
            background: lit && i < 3 ? "var(--thread-tint)" : "transparent",
            color: lit && i < 3 ? "var(--thread-deep)" : "var(--ink-soft)",
            transition: "all .4s ease"
          }}>{s}</span>
        ))}
      </div>
    </div>
  )
}

function CvDocAuto() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setOn(o => !o), 2600)
    return () => clearInterval(id)
  }, [])
  return <CvDoc tailored={on} />
}

// ── sections ─────────────────────────────────────────────────────────

function Nav({ onCta }: { onCta: () => void }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40,
      background: "color-mix(in oklab, var(--paper) 82%, transparent)",
      backdropFilter: "blur(12px)", borderBottom: "1px solid var(--line-soft)" }}>
      <div className="wrap" style={{ display: "flex", alignItems: "center", gap: 24, height: 68 }}>
        <Wordmark />
        <nav style={{ display: "flex", gap: 26, marginLeft: 14 }} className="nav-links">
          {(["How it works","Features","Beta"] as const).map(l => (
            <a key={l} href={"#" + l.toLowerCase().replace(/ /g, "-")}
              style={{ fontSize: 14.5, color: "var(--ink-soft)", fontWeight: 500,
                transition: "color .15s ease" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--ink)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--ink-soft)")}>{l}</a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <Link href="/tailor" style={{ fontSize: 14.5, fontWeight: 600 }} className="nav-signin">Sign in</Link>
        <button className="btn btn-dark" onClick={onCta} style={{ padding: "10px 18px", fontSize: 14.5 }}>
          Start free
        </button>
      </div>
    </header>
  )
}

function HeroA({ onCta }: { onCta: () => void }) {
  return (
    <section className="section" style={{ paddingTop: 72, paddingBottom: 84 }}>
      <div className="wrap hero-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "center" }}>
        <div className="hero-copy">
          <span className="eyebrow">Made to measure</span>
          <h1 className="display" style={{ fontSize: "clamp(44px, 6vw, 78px)", marginTop: 20 }}>
            Your CV,<br/><em>cut to fit</em> every<br/>job you want.
          </h1>
          <p className="lede" style={{ marginTop: 24, fontSize: 20 }}>
            Drop in your CV, paste the job, and Tailr re-cuts every line to match —
            ATS-safe, in about ten seconds.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={onCta}>✦ Tailor my CV — free</button>
            <a className="btn btn-ghost btn-lg" href="#how-it-works">See how it works</a>
          </div>
          <div style={{ marginTop: 30 }}><TrustRow /></div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", top: -22, right: 6, zIndex: 2,
            background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14,
            boxShadow: "var(--shadow-md)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <MatchRing score={92} run size={60} stroke={6} label="" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Strong match</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-soft)" }}>9 lines retuned</div>
            </div>
          </div>
          <CvDocAuto />
          <div style={{ position: "absolute", bottom: -18, left: -18, zIndex: 2 }}>
            <span className="chip" style={{ boxShadow: "var(--shadow-md)", background: "var(--paper)" }}>
              <span className="dot green" />ATS clear
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Drop in your CV", d: "Upload a PDF, DOCX or TXT — or paste it straight in. We remember it for next time.", tag: "30 sec" },
    { n: "02", t: "Paste the job", d: "Drop any LinkedIn, Indeed or Reed link and we fetch the description automatically.", tag: "1 click" },
    { n: "03", t: "Tailor & apply", d: "Get a re-cut CV, a match score, a cover letter and your interview pitches — ready to send.", tag: "~10 sec" },
  ]
  return (
    <section id="how-it-works" className="section" style={{ background: "var(--paper-2)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2 className="display">Three steps from <em>generic</em> to <em>get-the-call</em>.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }} className="steps-grid">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120} style={{ position: "relative", padding: "0 28px",
              borderLeft: i ? "1.5px dashed var(--line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="serif" style={{ fontSize: 46, color: "var(--thread)", fontWeight: 600, lineHeight: 1 }}>{s.n}</span>
                <span className="chip">{s.tag}</span>
              </div>
              <h3 className="serif" style={{ fontSize: 25, marginTop: 18, letterSpacing: "-0.01em" }}>{s.t}</h3>
              <p className="muted" style={{ marginTop: 10, fontSize: 16, lineHeight: 1.55 }}>{s.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatItem({ to, suffix = "", prefix = "", label, decimals = 0 }: {
  to: number; suffix?: string; prefix?: string; label: string; decimals?: number
}) {
  const [ref, seen] = useInView({ threshold: 0.5 })
  const v = useCountUp(to, seen, 1600)
  const shown = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString()
  return (
    <div ref={ref} style={{ textAlign: "center", padding: "0 18px" }}>
      <div className="serif tnum" style={{ fontSize: "clamp(40px,5vw,62px)", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {prefix}{shown}{suffix}
      </div>
      <div className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--ink-soft)", marginTop: 12 }}>{label}</div>
    </div>
  )
}

function Stats() {
  return (
    <section className="section" style={{ paddingTop: 72, paddingBottom: 72 }}>
      <div className="wrap stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 }}>
        <StatItem to={40000} suffix="+" label="CVs tailored" />
        <StatItem to={3.1} suffix="×" decimals={1} label="More interviews*" />
        <StatItem to={92} suffix="%" label="Avg ATS pass rate" />
        <StatItem to={11} suffix="s" label="Median tailor time" />
      </div>
      <div className="wrap" style={{ marginTop: 22 }}>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", textAlign: "center" }}>
          *Self-reported by Made-to-Measure users over 90 days. Your mileage will vary — but probably upward.
        </p>
      </div>
    </section>
  )
}

function FeatGlyph({ k }: { k: string }) {
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 11, background: "var(--thread-wash)",
    border: "1px solid var(--thread-tint)", display: "grid", placeItems: "center" }
  const s = { stroke: "var(--thread-deep)", strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const glyphs: Record<string, React.ReactNode> = {
    tailor: <><path d="M5 6 L19 18 M19 6 L5 18" {...s} /><circle cx="5" cy="6" r="2" {...s} /><circle cx="5" cy="18" r="2" {...s} /></>,
    score:  <><circle cx="12" cy="12" r="7.5" {...s} /><path d="M12 4.5 A7.5 7.5 0 0 1 18.5 9" {...s} stroke="var(--thread)" strokeWidth="2.4" /></>,
    diff:   <><path d="M5 8 H14 M5 12 H17 M5 16 H11" {...s} /><circle cx="19" cy="8" r="1.5" fill="var(--thread)" stroke="none" /></>,
    gaps:   <><path d="M12 4 V13 M12 17 V18.5" {...s} stroke="var(--thread)" strokeWidth="2.2" /><path d="M4 20 H20" {...s} /></>,
    scrape: <><path d="M9 13 a3 3 0 0 1 0-4 l2-2 a3 3 0 0 1 4 4 l-1 1" {...s} /><path d="M15 11 a3 3 0 0 1 0 4 l-2 2 a3 3 0 0 1-4-4 l1-1" {...s} /></>,
    extras: <><rect x="5" y="4" width="14" height="16" rx="2" {...s} /><path d="M8 9 H16 M8 12 H16 M8 15 H13" {...s} /></>,
  }
  return <div style={box}><svg width="24" height="24" viewBox="0 0 24 24">{glyphs[k]}</svg></div>
}

function Features() {
  const feats = [
    { t: "Line-by-line tailoring", d: "Every bullet rewritten to mirror the job's language — reordered, sharpened, and ATS-safe.", k: "tailor" },
    { t: "Match score, 0–100", d: "A ring badge that tells you how well you fit before you hit apply.", k: "score" },
    { t: "Key changes, colour-coded", d: "See exactly what was improved, reordered, removed or added — no black box.", k: "diff" },
    { t: "Gaps & follow-ups", d: "The requirements your CV can't yet support, plus interview questions to prep.", k: "gaps" },
    { t: "Job-link auto-scrape", d: "Paste a LinkedIn, Indeed, Reed or Glassdoor URL — we fetch the description for you.", k: "scrape" },
    { t: "Cover letters & pitches", d: "Generate a matched cover letter and 2–3 STAR interview stories on demand.", k: "extras" },
  ]
  return (
    <section id="features" className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What&apos;s in the kit</span>
          <h2 className="display">Not a rewrite button.<br/>A whole <em>tailor&apos;s table</em>.</h2>
          <p className="lede">Everything you need to go from &ldquo;I&apos;ll just send the same one&rdquo; to a CV that reads like it was written for the role.</p>
        </div>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {feats.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 90}>
              <article className="feat-card" style={{ background: "var(--paper)", border: "1px solid var(--line)",
                borderRadius: 14, padding: 24, height: "100%" }}>
                <FeatGlyph k={f.k} />
                <h3 className="serif" style={{ fontSize: 21, marginTop: 18, letterSpacing: "-0.01em" }}>{f.t}</h3>
                <p className="muted" style={{ marginTop: 9, fontSize: 15.5, lineHeight: 1.55 }}>{f.d}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatList({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "grid", gap: 13 }}>
      {items.map((it) => (
        <li key={it} style={{ display: "flex", alignItems: "flex-start", gap: 11, fontSize: 15.5, lineHeight: 1.35 }}>
          <span style={{ flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 99,
            background: dark ? "var(--thread)" : "var(--thread-wash)",
            display: "grid", placeItems: "center" }}>
            <svg width="11" height="11" viewBox="0 0 12 12">
              <path d="M2.5 6.2 L5 8.6 L9.5 3.5" fill="none"
                stroke={dark ? "#fff" : "var(--thread-deep)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0, color: dark ? "oklch(0.9 0.012 78)" : "var(--ink)" }}>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function Beta({ onCta }: { onCta: () => void }) {
  const betaFeats = [
    "Unlimited tailoring while in beta",
    "Match score, ATS check & key changes",
    "Cover letters & STAR interview pitches",
    "Interview prep with answer frameworks",
    "Job-link auto-scrape & history",
    "Kanban job tracker",
  ]

  return (
    <section id="beta" className="section" style={{ background: "var(--paper-2)", borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="section-head" style={{ marginInline: "auto", textAlign: "center", maxWidth: 680 }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Pre-release</span>
          <h2 className="display">Tailr is in <em>beta</em>.<br/>Everything&apos;s free for now.</h2>
        </div>

        <div style={{ maxWidth: 620, marginInline: "auto" }}>
          <div style={{ position: "relative", background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 18, padding: 36, boxShadow: "var(--shadow-md)", textAlign: "center" }}>
            <span className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 7,
              background: "var(--thread-wash)", color: "var(--thread-deep)", border: "1px solid var(--thread-tint)" }}>
              <span className="dot green" />Beta · no card needed
            </span>

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 22 }}>
              <span className="serif" style={{ fontSize: 60, fontWeight: 600, letterSpacing: "-0.02em" }}>£0</span>
              <span className="muted">during beta</span>
            </div>

            <p className="muted" style={{ marginTop: 10, fontSize: 16, lineHeight: 1.55, maxWidth: 440, marginInline: "auto" }}>
              We&apos;re still building Tailr in the open. Use every feature free while we&apos;re
              in pre-release — paid plans will arrive later, and early users get plenty of notice.
            </p>

            <button className="btn btn-primary btn-lg" onClick={onCta} style={{ marginTop: 26 }}>
              ✦ Try the beta — free
            </button>

            <div style={{ marginTop: 8 }}>
              <FeatList items={betaFeats} />
            </div>
          </div>
        </div>

        <p className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)", textAlign: "center", marginTop: 22 }}>
          Magic-link sign-in · no passwords · your feedback shapes what ships next
        </p>
      </div>
    </section>
  )
}

function Footer({ onCta }: { onCta: () => void }) {
  const cols: [string, string[]][] = [
    ["Product", ["How it works", "Features", "Beta", "Changelog"]],
    ["Company", ["About", "Blog", "Careers", "Contact"]],
    ["Legal", ["Privacy", "Terms", "Data & security"]],
  ]
  return (
    <footer style={{ background: "var(--ink)", color: "var(--paper)" }}>
      <div className="wrap" style={{ padding: "84px 32px 64px", textAlign: "center", borderBottom: "1px solid oklch(0.32 0.014 62)" }}>
        <h2 className="display" style={{ fontSize: "clamp(36px,5vw,60px)" }}>
          The next job won&apos;t <em style={{ color: "var(--thread)" }}>tailor itself</em>.
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={onCta}>✦ Tailor my CV — free</button>
          <a className="btn btn-lg" href="#beta"
            style={{ color: "var(--paper)", border: "1px solid oklch(0.4 0.014 62)" }}>About the beta</a>
        </div>
      </div>
      <div className="wrap foot-grid" style={{ padding: "52px 32px", display: "grid",
        gridTemplateColumns: "1.4fr repeat(3, 1fr)", gap: 32 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: 2,
            fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 26, fontWeight: 600 }}>
            tailr<span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--thread)", display: "inline-block" }} />
          </div>
          <p style={{ marginTop: 14, fontSize: 14.5, color: "oklch(0.74 0.012 78)", maxWidth: "34ch", lineHeight: 1.6 }}>
            Made-to-measure CVs for every job worth applying to. Tailor, score, apply.
          </p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.012 78)" }}>{h}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 11 }}>
              {links.map(l => (
                <li key={l}>
                  <a href="#" style={{ fontSize: 14.5, color: "oklch(0.84 0.012 78)", transition: "color .15s ease" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                    onMouseLeave={e => (e.currentTarget.style.color = "oklch(0.84 0.012 78)")}>{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="wrap" style={{ padding: "22px 32px", borderTop: "1px solid oklch(0.32 0.014 62)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 12, color: "oklch(0.62 0.012 78)" }}>© 2026 Tailr Labs</span>
        <span className="mono" style={{ fontSize: 12, color: "oklch(0.62 0.012 78)" }}>Cut to fit ✦ London</span>
      </div>
    </footer>
  )
}

// ── page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const fontClasses = `${newsreader.variable} ${hanken.variable} ${jetbrains.variable}`

  const onCta = useCallback(() => {
    window.location.href = "/tailor"
  }, [])

  return (
    <div id="top" className={`cl ${fontClasses}`}>
      <Nav onCta={onCta} />
      <main>
        <HeroA onCta={onCta} />
      </main>
      <HowItWorks />
      <Stats />
      <Features />
      <Beta onCta={onCta} />
      <Footer onCta={onCta} />
    </div>
  )
}
