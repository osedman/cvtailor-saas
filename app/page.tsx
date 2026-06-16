"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google"
import "./landing.css"

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

// ── logo mark (inline SVG) ───────────────────────────────────────────

function LogoMark({ size = 28 }: { size?: number }) {
  const s = size / 200
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width={size} height={size}>
      <defs>
        <linearGradient id="lf-g" x1="44" y1="50" x2="156" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3d6bf5" />
          <stop offset="1" stopColor="#16a8e0" />
        </linearGradient>
      </defs>
      <rect x="44" y="50" width="112" height="100" rx="16" fill="none" stroke="url(#lf-g)" strokeWidth="6" />
      <line x1="44" y1="82" x2="156" y2="82" stroke="url(#lf-g)" strokeWidth="5" />
      <circle cx="60" cy="66" r="4" fill="#3d6bf5" />
      <circle cx="76" cy="66" r="4" fill="#3d6bf5" />
      <text x="100" y="129" textAnchor="middle" fontWeight="600" fontSize="44" letterSpacing="-3" fill="#0c1018">lf</text>
    </svg>
  )
}

function LogoMarkDark({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width={size} height={size}>
      <defs>
        <linearGradient id="lf-gd" x1="44" y1="50" x2="156" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6e9bff" />
          <stop offset="1" stopColor="#34d6ff" />
        </linearGradient>
      </defs>
      <rect x="44" y="50" width="112" height="100" rx="16" fill="none" stroke="url(#lf-gd)" strokeWidth="6" />
      <line x1="44" y1="82" x2="156" y2="82" stroke="url(#lf-gd)" strokeWidth="5" />
      <circle cx="60" cy="66" r="4" fill="#6e9bff" />
      <circle cx="76" cy="66" r="4" fill="#6e9bff" />
      <text x="100" y="129" textAnchor="middle" fontWeight="600" fontSize="44" letterSpacing="-3" fill="#eef2fa">lf</text>
    </svg>
  )
}

function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <a href="#top" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {dark ? <LogoMarkDark size={30} /> : <LogoMark size={30} />}
      <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>
        <span style={{ color: dark ? "#eef2fa" : "#0c1018" }}>lean</span>
        <span style={{ color: dark ? "#6e9bff" : "#3d6bf5" }}>frame</span>
      </span>
    </a>
  )
}

// ── shared components ────────────────────────────────────────────────

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

function TrustRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex" }}>
        {(["#6e9bff","#34d6ff","#3d6bf5","#16a8e0"] as const).map((c, i) => (
          <span key={i} style={{ width: 30, height: 30, borderRadius: 99, background: c,
            border: "2px solid var(--paper)", marginLeft: i ? -9 : 0, display: "grid",
            placeItems: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
            {["A","J","M","K"][i]}
          </span>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4 }}>
        <strong style={{ color: "var(--ink)" }}>40,000+</strong> CVs tailored ·{" "}
        <span style={{ color: "#3d6bf5" }}>★★★★★</span> 4.9
      </div>
    </div>
  )
}

function MatchRing({ score = 92, run = true, size = 96, stroke = 8 }: {
  score?: number; run?: boolean; size?: number; stroke?: number
}) {
  const v = useCountUp(score, run)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - v / 100)
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="ring-g" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3d6bf5" />
            <stop offset="100%" stopColor="#16a8e0" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#ring-g)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset .1s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
        <span className="tnum" style={{ fontSize: size * 0.32, fontWeight: 700, letterSpacing: "-0.02em" }}>{Math.round(v)}</span>
      </div>
    </div>
  )
}

function CvDoc({ tailored = false }: { tailored?: boolean }) {
  const tinted = [1, 3, 6, 8, 9]

  const Line = ({ w, i, h = 7 }: { w: string; i: number; h?: number }) => (
    <div className={"doc-line" + (tailored && tinted.includes(i) ? " tinted" : "")}
      style={{ width: w, height: h }} />
  )

  return (
    <div className="doc thin-scroll" style={{ padding: 24, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="doc-name">Alex Rivera</div>
          <div className="doc-meta" style={{ marginTop: 4 }}>Product Marketing Manager</div>
        </div>
        <div className="doc-meta" style={{ textAlign: "right", lineHeight: 1.5 }}>
          alex@rivera.co<br/>London, UK
        </div>
      </div>
      <div className="doc-rule" style={{ margin: "14px 0" }} />
      <div className="doc-h">Summary</div>
      <div style={{ display: "grid", gap: 7, margin: "8px 0 16px" }}>
        <Line w="100%" i={0} /><Line w="92%" i={1} /><Line w="74%" i={2} />
      </div>
      <div className="doc-h">Experience</div>
      <div style={{ display: "grid", gap: 7, margin: "8px 0 16px" }}>
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
            borderRadius: 6, border: "1px solid var(--line)",
            background: tailored && i < 3 ? "var(--thread-tint)" : "transparent",
            color: tailored && i < 3 ? "var(--thread)" : "var(--ink-faint)",
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
      background: "rgba(248,250,252,0.88)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--line)" }}>
      <div className="wrap" style={{ display: "flex", alignItems: "center", gap: 24, height: 64 }}>
        <Wordmark />
        <nav style={{ display: "flex", gap: 26, marginLeft: 14 }} className="nav-links">
          {(["How it works","Features","Pricing"] as const).map(l => (
            <a key={l} href={"#" + l.toLowerCase().replace(/ /g, "-")}
              style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 500,
                transition: "color .15s ease" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--ink)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--ink-soft)")}>{l}</a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <Link href="/tailor" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }} className="nav-signin">Sign in</Link>
        <button className="btn btn-primary" onClick={onCta} style={{ padding: "9px 18px", fontSize: 14 }}>
          Start free
        </button>
      </div>
    </header>
  )
}

function Hero({ onCta }: { onCta: () => void }) {
  return (
    <section className="section" style={{ paddingTop: 72, paddingBottom: 88,
      background: "linear-gradient(180deg, #f4f7ff 0%, var(--paper) 100%)" }}>
      <div className="wrap hero-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 64, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
            background: "var(--thread-tint)", borderRadius: 999, marginBottom: 24,
            border: "1px solid rgba(61,107,245,.15)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 99,
              background: "linear-gradient(135deg,#3d6bf5,#16a8e0)", display: "inline-block" }} />
            <span className="mono" style={{ fontSize: 11, color: "var(--thread)", letterSpacing: "0.1em",
              textTransform: "uppercase", fontWeight: 500 }}>AI-powered CV tailoring</span>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(42px, 5.8vw, 72px)" }}>
            Your CV, <em>fitted</em><br/>to every role.
          </h1>
          <p className="lede" style={{ marginTop: 22, fontSize: 19 }}>
            Drop in your CV, paste the job description, and Leanframe rewrites every
            line to match — ATS-safe, in about ten seconds.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={onCta}>Tailor my CV — free</button>
            <a className="btn btn-ghost btn-lg" href="#how-it-works">See how it works</a>
          </div>
          <div style={{ marginTop: 32 }}><TrustRow /></div>
        </div>

        <div style={{ position: "relative" }}>
          {/* floating match badge */}
          <div style={{ position: "absolute", top: -24, right: -8, zIndex: 2,
            background: "#fff", border: "1px solid var(--line)", borderRadius: 14,
            boxShadow: "var(--shadow-md)", padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 12 }}>
            <MatchRing score={92} run size={58} stroke={6} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>Strong match</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-soft)", marginTop: 2 }}>9 lines rewritten</div>
            </div>
          </div>

          <CvDocAuto />

          {/* floating ATS badge */}
          <div style={{ position: "absolute", bottom: -16, left: -16, zIndex: 2 }}>
            <span className="chip" style={{ boxShadow: "var(--shadow-md)", background: "#fff" }}>
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
    <section id="how-it-works" className="section" style={{ background: "#fff",
      borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2 className="display">Three steps from <em>generic</em> to <em>get the call</em>.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }} className="steps-grid">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120} style={{ padding: "0 32px",
              borderLeft: i ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1,
                  background: "linear-gradient(135deg,#3d6bf5,#16a8e0)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text" }}>{s.n}</span>
                <span className="chip">{s.tag}</span>
              </div>
              <h3 style={{ fontSize: 22, marginTop: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>{s.t}</h3>
              <p className="muted" style={{ marginTop: 10, fontSize: 16, lineHeight: 1.6 }}>{s.d}</p>
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
      <div className="tnum" style={{ fontSize: "clamp(40px,5vw,60px)", fontWeight: 800, lineHeight: 1,
        letterSpacing: "-0.04em", background: "linear-gradient(135deg,#3d6bf5,#16a8e0)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
        {prefix}{shown}{suffix}
      </div>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--ink-soft)", marginTop: 12 }}>{label}</div>
    </div>
  )
}

function Stats() {
  return (
    <section className="section" style={{ paddingTop: 72, paddingBottom: 72, background: "var(--paper)" }}>
      <div className="wrap stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 }}>
        <StatItem to={40000} suffix="+" label="CVs tailored" />
        <StatItem to={3.1} suffix="×" decimals={1} label="More interviews*" />
        <StatItem to={92} suffix="%" label="Avg ATS pass rate" />
        <StatItem to={11} suffix="s" label="Median tailor time" />
      </div>
      <div className="wrap" style={{ marginTop: 22 }}>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", textAlign: "center" }}>
          *Self-reported by users over 90 days. Your mileage will vary — but probably upward.
        </p>
      </div>
    </section>
  )
}

function FeatGlyph({ k }: { k: string }) {
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 12,
    background: "var(--thread-tint)", border: "1px solid rgba(61,107,245,.15)",
    display: "grid", placeItems: "center" }
  const s = { stroke: "#3d6bf5", strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const glyphs: Record<string, React.ReactNode> = {
    tailor: <><path d="M5 6 L19 18 M19 6 L5 18" {...s} /><circle cx="5" cy="6" r="2" {...s} /><circle cx="5" cy="18" r="2" {...s} /></>,
    score:  <><circle cx="12" cy="12" r="7.5" {...s} /><path d="M12 4.5 A7.5 7.5 0 0 1 18.5 9" {...s} stroke="#3d6bf5" strokeWidth="2.4" /></>,
    diff:   <><path d="M5 8 H14 M5 12 H17 M5 16 H11" {...s} /><circle cx="19" cy="8" r="1.5" fill="#3d6bf5" stroke="none" /></>,
    gaps:   <><path d="M12 4 V13 M12 17 V18.5" {...s} stroke="#3d6bf5" strokeWidth="2.2" /><path d="M4 20 H20" {...s} /></>,
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
    <section id="features" className="section" style={{ background: "#fff" }}>
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What&apos;s in the kit</span>
          <h2 className="display">Not a rewrite button. A whole <em>tailoring suite</em>.</h2>
          <p className="lede">Everything you need to go from &ldquo;I&apos;ll just send the same CV&rdquo; to one that reads like it was written for the role.</p>
        </div>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {feats.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 90}>
              <article className="feat-card" style={{ background: "var(--paper)", border: "1px solid var(--line)",
                borderRadius: 14, padding: 24, height: "100%",
                transition: "border-color .2s, transform .2s, box-shadow .2s" }}>
                <FeatGlyph k={f.k} />
                <h3 style={{ fontSize: 18, marginTop: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>{f.t}</h3>
                <p className="muted" style={{ marginTop: 9, fontSize: 15, lineHeight: 1.6 }}>{f.d}</p>
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
    <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "grid", gap: 12 }}>
      {items.map((it) => (
        <li key={it} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15, lineHeight: 1.4 }}>
          <span style={{ flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 99,
            background: dark ? "rgba(61,107,245,.3)" : "var(--thread-tint)",
            border: dark ? "1px solid rgba(61,107,245,.4)" : "1px solid rgba(61,107,245,.2)",
            display: "grid", placeItems: "center" }}>
            <svg width="10" height="10" viewBox="0 0 12 12">
              <path d="M2.5 6.2 L5 8.6 L9.5 3.5" fill="none"
                stroke={dark ? "#6e9bff" : "#3d6bf5"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span style={{ flex: 1, color: dark ? "rgba(238,242,250,.85)" : "var(--ink)" }}>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function Pricing({ onCta }: { onCta: () => void }) {
  const [annual, setAnnual] = useState(true)
  const price = annual ? 9 : 12

  const freeFeats = ["3 tailored CVs / month", "Match score & ATS check", "Key changes & gaps", "Download as .txt", "Saves your last CV"]
  const premFeats = ["Unlimited tailoring", "Cover letters & STAR pitches", "Job-link auto-scrape", "Version history", "Priority AI & faster runs", "Everything in Starter"]

  return (
    <section id="pricing" className="section" style={{ background: "var(--paper)",
      borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="section-head" style={{ marginInline: "auto", textAlign: "center", maxWidth: 640 }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Pricing</span>
          <h2 className="display">Start free. <em>Scale up</em> when you need to.</h2>
        </div>

        {/* billing toggle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: 4, background: "#fff",
            border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow-sm)" }}>
            {([["Monthly", false], ["Annual", true]] as const).map(([label, val]) => (
              <button key={label} onClick={() => setAnnual(val)}
                style={{ border: 0, borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600,
                  fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                  background: annual === val ? "linear-gradient(135deg,#3d6bf5,#16a8e0)" : "transparent",
                  color: annual === val ? "#fff" : "var(--ink-soft)", transition: "all .18s ease",
                  cursor: "pointer" }}>
                {label}
                {val && <span className="mono" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99,
                  background: annual === val ? "rgba(255,255,255,.2)" : "var(--thread-tint)",
                  color: annual === val ? "#fff" : "var(--thread)" }}>−25%</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="price-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
          maxWidth: 880, marginInline: "auto" }}>
          {/* FREE */}
          <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: 32 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--ink-soft)" }}>Starter</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 16 }}>
              <span style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.04em" }}>£0</span>
              <span className="muted">forever</span>
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 15 }}>For the occasional application.</p>
            <button className="btn btn-ghost" onClick={onCta} style={{ width: "100%", marginTop: 20 }}>Get started free</button>
            <FeatList items={freeFeats} />
          </div>

          {/* PRO */}
          <div style={{ position: "relative", background: "#0c1018", color: "#eef2fa",
            borderRadius: 16, padding: 32, boxShadow: "var(--shadow-lg)",
            border: "1px solid rgba(61,107,245,.3)" }}>
            <div style={{ position: "absolute", top: -1, left: 32, right: 32, height: 3, borderRadius: "0 0 4px 4px",
              background: "linear-gradient(90deg,#3d6bf5,#16a8e0)" }} />
            <span className="chip" style={{ position: "absolute", top: 20, right: 20,
              background: "rgba(61,107,245,.15)", borderColor: "rgba(61,107,245,.3)",
              color: "#6e9bff" }}>Most popular</span>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#6e9bff" }}>Pro</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 16 }}>
              <span className="tnum" style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.04em",
                background: "linear-gradient(135deg,#6e9bff,#34d6ff)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>£{price}</span>
              <span style={{ color: "rgba(238,242,250,.6)" }}>/ month</span>
            </div>
            <p style={{ marginTop: 6, fontSize: 15, color: "rgba(238,242,250,.6)", minHeight: 22 }}>
              {annual ? "Billed £108 yearly — two months free." : "Billed monthly. Cancel anytime."}
            </p>
            <button className="btn btn-primary" onClick={onCta} style={{ width: "100%", marginTop: 20 }}>
              Go Pro
            </button>
            <FeatList items={premFeats} dark />
          </div>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", textAlign: "center", marginTop: 22 }}>
          Magic-link sign-in · no passwords · cancel in two clicks
        </p>
      </div>
    </section>
  )
}

function Footer({ onCta }: { onCta: () => void }) {
  const cols: [string, string[]][] = [
    ["Product", ["How it works", "Features", "Pricing", "Changelog"]],
    ["Company", ["About", "Blog", "Careers", "Contact"]],
    ["Legal", ["Privacy", "Terms", "Data & security"]],
  ]
  return (
    <footer style={{ background: "#0c1018", color: "#eef2fa" }}>
      {/* CTA band */}
      <div className="wrap" style={{ padding: "80px 32px 64px", textAlign: "center",
        borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <h2 className="display" style={{ fontSize: "clamp(34px,5vw,58px)" }}>
          The next job won&apos;t <em>tailor itself</em>.
        </h2>
        <p style={{ marginTop: 16, fontSize: 17, color: "rgba(238,242,250,.6)", maxWidth: "42ch", marginInline: "auto" }}>
          Upload once. Paste any job. Get a CV that&apos;s rewritten to fit — in seconds.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={onCta}>Tailor my CV — free</button>
          <a className="btn btn-lg" href="#pricing"
            style={{ color: "#eef2fa", border: "1px solid rgba(255,255,255,.15)",
              background: "transparent" }}>Compare plans</a>
        </div>
      </div>
      {/* links */}
      <div className="wrap foot-grid" style={{ padding: "52px 32px", display: "grid",
        gridTemplateColumns: "1.4fr repeat(3, 1fr)", gap: 32 }}>
        <div>
          <Wordmark dark />
          <p style={{ marginTop: 16, fontSize: 14, color: "rgba(238,242,250,.5)", maxWidth: "34ch", lineHeight: 1.7 }}>
            AI-powered CV tailoring for every job worth applying to. Tailor, score, apply.
          </p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "rgba(238,242,250,.35)" }}>{h}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 10 }}>
              {links.map(l => (
                <li key={l}>
                  <a href="#" style={{ fontSize: 14, color: "rgba(238,242,250,.6)", transition: "color .15s ease" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(238,242,250,.6)")}>{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="wrap" style={{ padding: "20px 32px", borderTop: "1px solid rgba(255,255,255,.08)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 12, color: "rgba(238,242,250,.3)" }}>© 2026 Leanframe</span>
        <span className="mono" style={{ fontSize: 12, color: "rgba(238,242,250,.3)" }}>Built with precision ✦ London</span>
      </div>
    </footer>
  )
}

// ── page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const onCta = useCallback(() => {
    window.location.href = "/tailor"
  }, [])

  const scrollToPricing = useCallback(() => {
    const el = document.getElementById("pricing")
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    else window.location.href = "/tailor"
  }, [])

  return (
    <div id="top" className={`cl ${hanken.variable} ${jetbrains.variable}`}>
      <Nav onCta={scrollToPricing} />
      <main>
        <Hero onCta={scrollToPricing} />
      </main>
      <HowItWorks />
      <Stats />
      <Features />
      <Pricing onCta={onCta} />
      <Footer onCta={onCta} />
    </div>
  )
}
