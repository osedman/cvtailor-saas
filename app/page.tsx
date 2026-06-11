"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google"
import {
  ArrowRight, Check, Sparkles, Target, Kanban, FileText,
  MessageCircleQuestion, Building2, ShieldCheck, Zap, Clock,
  Link2, Download, History,
} from "lucide-react"

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
})
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
})

const ACCENT = "#dc4f33"
const INK = "#1e1813"

// ── Reveal on scroll ─────────────────────────────────────────────────────

function Reveal({ children, delay = 0, className = "" }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect() }
    }, { threshold: 0.15 })
    io.observe(el)
    if (el.getBoundingClientRect().top < (window.innerHeight || 800)) setSeen(true)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(16px)",
        transition: `opacity .6s cubic-bezier(.2,.7,.2,1) ${delay}ms, transform .6s cubic-bezier(.2,.7,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Wordmark ─────────────────────────────────────────────────────────────

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 text-[22px] font-extrabold tracking-tight" style={{ color: light ? "#fff" : INK }}>
      tailr
      <span className="w-1.5 h-1.5 rounded-full inline-block -translate-y-px" style={{ background: ACCENT }} />
    </span>
  )
}

// ── Nav ──────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <header className={`sticky top-0 z-50 transition-all duration-200 ${scrolled ? "bg-white/85 backdrop-blur-md border-b border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.03)]" : "bg-white"}`}>
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-8">
        <a href="#top"><Wordmark /></a>
        <nav className="hidden md:flex items-center gap-7">
          {[["How it works", "#how-it-works"], ["Features", "#features"], ["Beta", "#beta"]].map(([l, h]) => (
            <a key={l} href={h} className="text-[14.5px] font-medium text-gray-500 hover:text-[#1e1813] transition-colors">{l}</a>
          ))}
        </nav>
        <div className="flex-1" />
        <Link href="/tailor" className="text-[14.5px] font-semibold text-gray-600 hover:text-[#1e1813] transition-colors">Sign in</Link>
        <Link
          href="/tailor"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[14px] font-semibold text-white rounded-lg transition-colors"
          style={{ background: INK }}
        >
          Tailor my CV
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </header>
  )
}

// ── Product mockup (hero) ────────────────────────────────────────────────

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16a34a" strokeWidth={6}
          strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-base font-bold text-[#1e1813]">{score}</span>
        <span className="text-[7px] uppercase tracking-widest text-gray-400">match</span>
      </div>
    </div>
  )
}

function Line({ w, tinted = false }: { w: string; tinted?: boolean }) {
  return <div className="h-[7px] rounded-full" style={{ width: w, background: tinted ? "#ffd8cd" : "#eceae6" }} />
}

function HeroMockup() {
  return (
    <div className="relative mx-auto max-w-4xl">
      {/* Browser chrome */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_30px_80px_rgba(30,24,19,0.12),0_8px_24px_rgba(30,24,19,0.06)] overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <div className="mx-auto px-12 py-1 rounded-md bg-white border border-gray-100 text-[10px] text-gray-400 font-medium">
            gettailr.vercel.app
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-white">
          {/* Left: CV panel */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>Your CV</span>
              <span className="text-[9px] text-gray-400 bg-white border border-gray-100 rounded px-1.5 py-0.5">cv-alex-morgan.pdf</span>
            </div>
            <div className="space-y-2">
              <Line w="55%" /><Line w="92%" /><Line w="85%" tinted /><Line w="78%" />
              <div className="h-2" />
              <Line w="45%" /><Line w="88%" tinted /><Line w="94%" /><Line w="70%" tinted />
            </div>
          </div>
          {/* Right: results */}
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tailored result</span>
              <ScoreRing score={87} size={48} />
            </div>
            <div className="space-y-2">
              {[
                ["Strong", "#dcfce7", "#16a34a", "Stakeholder management"],
                ["Strong", "#dcfce7", "#16a34a", "SQL & data analysis"],
                ["Transferable", "#ffeae4", ACCENT, "Media platform delivery"],
                ["Partial", "#fef3c7", "#d97706", "Team leadership"],
              ].map(([label, bg, color, req], i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg as string, color: color as string }}>{label}</span>
                  <span className="text-[10px] text-gray-500 truncate">{req}</span>
                </div>
              ))}
              <div className="pt-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-1 rounded-md text-white" style={{ background: ACCENT }}>
                  <Sparkles className="w-2.5 h-2.5" />Tailored in 28s
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-1 rounded-md bg-green-50 text-green-600">
                  <Check className="w-2.5 h-2.5" />ATS pass
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating chips */}
      <div className="absolute -left-4 sm:-left-10 top-1/3 hidden md:block">
        <div className="bg-white rounded-xl border border-gray-100 shadow-lg px-3.5 py-2.5 flex items-center gap-2">
          <MessageCircleQuestion className="w-4 h-4" style={{ color: ACCENT }} />
          <div>
            <p className="text-[11px] font-semibold text-[#1e1813]">Interview prep ready</p>
            <p className="text-[9px] text-gray-400">9 likely questions predicted</p>
          </div>
        </div>
      </div>
      <div className="absolute -right-4 sm:-right-8 bottom-8 hidden md:block">
        <div className="bg-white rounded-xl border border-gray-100 shadow-lg px-3.5 py-2.5 flex items-center gap-2">
          <Kanban className="w-4 h-4 text-violet-500" />
          <div>
            <p className="text-[11px] font-semibold text-[#1e1813]">Moved to Interview</p>
            <p className="text-[9px] text-gray-400">Senior BA · StreamCo</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="pt-20 pb-24 px-5">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-1.5 rounded-full border" style={{ color: ACCENT, borderColor: "#ffd8cd", background: "#fff7f4" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
            Free while in beta
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-6 text-[clamp(40px,6.5vw,68px)] font-extrabold tracking-[-0.03em] leading-[1.04] text-[#1e1813]">
            The CV platform built<br className="hidden sm:block" /> for every application
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 text-lg sm:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto">
            Tailr rewrites your CV for each job, scores the match against real evidence,
            preps you for the interview, and tracks every application — in about 30 seconds.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/tailor"
              className="inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-[0_8px_24px_rgba(220,79,51,0.3)] hover:shadow-[0_10px_28px_rgba(220,79,51,0.4)] transition-all hover:-translate-y-0.5"
              style={{ background: ACCENT }}
            >
              Tailor my CV — free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-semibold text-[#1e1813] rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              See how it works
            </a>
          </div>
        </Reveal>
        <Reveal delay={300}>
          <p className="mt-5 text-[13px] text-gray-400">No card required · Magic-link sign-in · ATS-safe output</p>
        </Reveal>
      </div>

      <Reveal delay={350} className="mt-16">
        <HeroMockup />
      </Reveal>
    </section>
  )
}

// ── Stats strip ──────────────────────────────────────────────────────────

function Stats() {
  const stats = [
    ["~30s", "median tailor time"],
    ["2-pass", "evidence-checked engine"],
    ["100%", "claims traced to your CV"],
    ["£0", "while in beta"],
  ]
  return (
    <section className="border-y border-gray-100 bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map(([v, l], i) => (
          <Reveal key={l} delay={i * 70} className="text-center">
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1e1813]">{v}</p>
            <p className={`${jetbrains.className} mt-2 text-[11px] uppercase tracking-[0.14em] text-gray-400`}>{l}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── How it works ─────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      n: "01", t: "Drop in your CV",
      d: "Upload a PDF, DOCX or TXT — or paste it straight in. We remember it for next time.",
      icon: <FileText className="w-5 h-5" />,
    },
    {
      n: "02", t: "Paste the job",
      d: "Drop any LinkedIn, Indeed or Reed link and we fetch the description automatically.",
      icon: <Link2 className="w-5 h-5" />,
    },
    {
      n: "03", t: "Tailor & apply",
      d: "A re-cut CV, evidence-based match score, interview prep and a tracked application — ready to send.",
      icon: <Sparkles className="w-5 h-5" />,
    },
  ]
  return (
    <section id="how-it-works" className="py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className={`${jetbrains.className} text-[12px] font-medium uppercase tracking-[0.16em]`} style={{ color: ACCENT }}>How it works</p>
          <h2 className="mt-4 text-[clamp(30px,4.5vw,44px)] font-extrabold tracking-[-0.025em] leading-tight text-[#1e1813]">
            Three steps from generic to get-the-call
          </h2>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="h-full rounded-2xl border border-gray-100 bg-white p-7 hover:shadow-[0_12px_32px_rgba(30,24,19,0.06)] hover:border-gray-200 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#fff7f4", color: ACCENT }}>
                    {s.icon}
                  </div>
                  <span className="text-4xl font-extrabold text-gray-100">{s.n}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#1e1813]">{s.t}</h3>
                <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Feature modules (alternating) ────────────────────────────────────────

function ModuleMockCoverage() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_16px_48px_rgba(30,24,19,0.08)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Requirements coverage</p>
      {[
        ["Strong", "#dcfce7", "#16a34a", "SQL & data analysis", "must-have"],
        ["Strong", "#dcfce7", "#16a34a", "Requirements gathering", "must-have"],
        ["Transferable", "#ffeae4", ACCENT, "Media platform experience", "must-have"],
        ["Partial", "#fef3c7", "#d97706", "Team leadership", ""],
        ["Missing", "#fee2e2", "#dc2626", "Python", ""],
      ].map(([label, bg, color, req, must], i) => (
        <div key={i} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg as string, color: color as string }}>{label}</span>
          <span className="text-[12px] text-[#1e1813] truncate">{req}</span>
          {must && <span className="ml-auto text-[8px] font-bold uppercase tracking-wide text-gray-300">{must}</span>}
        </div>
      ))}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2.5">
        <span className="text-[11px] font-medium text-gray-500">Computed match score</span>
        <span className="text-sm font-extrabold text-[#1e1813]">82 / 100</span>
      </div>
    </div>
  )
}

function ModuleMockPrep() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_16px_48px_rgba(30,24,19,0.08)] p-5 space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Interview prep</p>
      {[
        ["Gap probing", "#fee2e2", "#dc2626", "“Your CV doesn’t mention Python — how would you close that gap?”"],
        ["Behavioural", "#ffeae4", ACCENT, "“Tell me about a migration you led under pressure.”"],
        ["Technical", "#ede9fe", "#7c3aed", "“How do you size delivery options with SQL?”"],
      ].map(([cat, bg, color, q], i) => (
        <div key={i} className="rounded-xl border border-gray-100 p-3">
          <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded" style={{ background: bg as string, color: color as string }}>{cat}</span>
          <p className="mt-1.5 text-[12px] font-medium text-[#1e1813] leading-snug">{q}</p>
        </div>
      ))}
    </div>
  )
}

function ModuleMockCompany() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_16px_48px_rgba(30,24,19,0.08)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#fff7f4" }}>
          <Building2 className="w-4 h-4" style={{ color: ACCENT }} />
        </div>
        <div>
          <p className="text-[12px] font-bold text-[#1e1813]">StreamCo</p>
          <p className="text-[9px] text-gray-400">Researched live · 3 sources</p>
        </div>
      </div>
      {[
        ["WHAT THEY DO", "Streaming infrastructure for broadcasters in 14 markets"],
        ["RECENT", "Acquired MediaFlow in March · expanding analytics team"],
        ["ASK THEM", "How does the BA team shape the analytics roadmap post-acquisition?"],
      ].map(([h, t], i) => (
        <div key={i} className="py-2 border-b border-gray-50 last:border-0">
          <p className={`${jetbrains.className} text-[8px] tracking-[0.14em] mb-1`} style={{ color: ACCENT }}>{h}</p>
          <p className="text-[11.5px] text-gray-600 leading-snug">{t}</p>
        </div>
      ))}
    </div>
  )
}

function ModuleMockTracker() {
  const cols: Array<[string, string, Array<[string, string]>]> = [
    ["Saved", "#6b7280", [["Product Analyst", "DataCo"]]],
    ["Applied", ACCENT, [["Senior BA", "StreamCo"], ["Lead BA", "FinServ"]]],
    ["Interview", "#7c3aed", [["BA Manager", "MediaCo"]]],
  ]
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_16px_48px_rgba(30,24,19,0.08)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Job tracker</p>
      <div className="grid grid-cols-3 gap-2.5">
        {cols.map(([col, color, jobs]) => (
          <div key={col as string}>
            <p className="text-[9px] font-bold mb-2" style={{ color: color as string }}>{col} · {(jobs as Array<[string, string]>).length}</p>
            <div className="space-y-2">
              {(jobs as Array<[string, string]>).map(([title, co], i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/50 p-2">
                  <p className="text-[10px] font-semibold text-[#1e1813] truncate">{title}</p>
                  <p className="text-[8px] text-gray-400 truncate">{co}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Modules() {
  const modules = [
    {
      eyebrow: "Tailoring engine",
      title: "Evidence-checked tailoring, not keyword stuffing",
      body: "A two-pass engine extracts every requirement from the job description, maps it to real evidence in your CV, then rewrites with that map as ground truth. The match score is computed from coverage — never invented.",
      points: ["Match score backed by a visible requirements table", "Keywords woven in only where your CV supports them", "Deterministic ATS keyword check on the final text"],
      mock: <ModuleMockCoverage />,
    },
    {
      eyebrow: "Interview prep",
      title: "Walk in knowing what they'll ask",
      body: "Tailr predicts the questions you're likely to face — including the uncomfortable ones probing your gaps — with an answer framework and talking points drawn from your own experience.",
      points: ["8–10 predicted questions per role", "Gap-probing questions targeting your weak spots", "STAR pitches built from your real experience"],
      mock: <ModuleMockPrep />,
    },
    {
      eyebrow: "Company analysis",
      title: "Research the company in one click",
      body: "Live web research summarised for your specific role: what they do, recent developments, culture signals, and smart questions to ask at the end of the interview.",
      points: ["Live web search, not stale training data", "Framed around the role you're applying for", "Smart questions that show you did the work"],
      mock: <ModuleMockCompany />,
    },
    {
      eyebrow: "Job tracker",
      title: "Every application, one board",
      body: "A Kanban board for your search: Saved → Applied → Interview → Offer. Each card keeps the job description, your tailored CV version, and a notes log — added straight from your tailoring history.",
      points: ["Drag between stages, saved instantly", "Tailored CV and JD stored on every card", "Notes with timestamps for every conversation"],
      mock: <ModuleMockTracker />,
    },
  ]
  return (
    <section id="features" className="py-24 px-5 bg-gray-50/50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center max-w-2xl mx-auto mb-20">
          <p className={`${jetbrains.className} text-[12px] font-medium uppercase tracking-[0.16em]`} style={{ color: ACCENT }}>Features</p>
          <h2 className="mt-4 text-[clamp(30px,4.5vw,44px)] font-extrabold tracking-[-0.025em] leading-tight text-[#1e1813]">
            Not a rewrite button.<br />A complete application platform.
          </h2>
        </Reveal>

        <div className="space-y-24">
          {modules.map((m, i) => (
            <div key={m.eyebrow} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <Reveal delay={60}>
                <p className={`${jetbrains.className} text-[11px] font-medium uppercase tracking-[0.16em]`} style={{ color: ACCENT }}>{m.eyebrow}</p>
                <h3 className="mt-3 text-[clamp(24px,3vw,32px)] font-extrabold tracking-[-0.02em] leading-tight text-[#1e1813]">{m.title}</h3>
                <p className="mt-4 text-[16px] text-gray-500 leading-relaxed">{m.body}</p>
                <ul className="mt-6 space-y-3">
                  {m.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[14.5px] text-gray-600">
                      <span className="mt-0.5 w-4.5 h-4.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: "#ffeae4" }}>
                        <Check className="w-2.5 h-2.5" style={{ color: ACCENT }} />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={140}>{m.mock}</Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Benefits grid ────────────────────────────────────────────────────────

function Benefits() {
  const items = [
    { icon: <ShieldCheck className="w-5 h-5" />, t: "Truth-guaranteed", d: "Every claim traces to your original CV. Nothing invented, ever." },
    { icon: <Zap className="w-5 h-5" />, t: "~30 second runs", d: "Two fast passes instead of one slow one. Built for momentum." },
    { icon: <Target className="w-5 h-5" />, t: "Computed match score", d: "Weighted requirement coverage you can audit — not model vibes." },
    { icon: <Download className="w-5 h-5" />, t: "Word & text export", d: "Download as .doc or .txt, formatted and ATS-safe." },
    { icon: <History className="w-5 h-5" />, t: "Full history", d: "Every tailored version saved with side-by-side comparison." },
    { icon: <Clock className="w-5 h-5" />, t: "Role-aware writing", d: "Engineering, sales, healthcare — bullets follow your field's rules." },
  ]
  return (
    <section className="py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-[clamp(30px,4.5vw,44px)] font-extrabold tracking-[-0.025em] leading-tight text-[#1e1813]">
            Built to be trusted
          </h2>
          <p className="mt-4 text-lg text-gray-500">The details that make the difference between a tool and a platform.</p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={(i % 3) * 80}>
              <div className="h-full rounded-2xl border border-gray-100 p-6 hover:shadow-[0_12px_32px_rgba(30,24,19,0.06)] hover:border-gray-200 transition-all duration-200">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#fff7f4", color: ACCENT }}>
                  {it.icon}
                </div>
                <h3 className="mt-4 text-[16px] font-bold text-[#1e1813]">{it.t}</h3>
                <p className="mt-1.5 text-[14px] text-gray-500 leading-relaxed">{it.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Beta section ─────────────────────────────────────────────────────────

function Beta() {
  const feats = [
    "Unlimited tailoring while in beta",
    "Evidence-checked match scores",
    "Interview prep & STAR pitches",
    "Live company analysis",
    "Kanban job tracker",
    "Word & text downloads",
  ]
  return (
    <section id="beta" className="py-24 px-5 bg-gray-50/50 border-y border-gray-100">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <p className={`${jetbrains.className} text-[12px] font-medium uppercase tracking-[0.16em]`} style={{ color: ACCENT }}>Pre-release</p>
          <h2 className="mt-4 text-[clamp(30px,4.5vw,44px)] font-extrabold tracking-[-0.025em] leading-tight text-[#1e1813]">
            Tailr is in beta. Everything&apos;s free for now.
          </h2>
          <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
            We&apos;re building Tailr in the open. Use every feature free while we&apos;re in
            pre-release — paid plans arrive later, and early users get plenty of notice.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-10 rounded-2xl border border-gray-200 bg-white shadow-[0_16px_48px_rgba(30,24,19,0.07)] p-8 sm:p-10">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-6xl font-extrabold tracking-tight text-[#1e1813]">£0</span>
              <span className="text-gray-400 font-medium">during beta</span>
            </div>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-left max-w-xl mx-auto">
              {feats.map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-[14.5px] text-gray-600">
                  <span className="mt-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: "#ffeae4" }}>
                    <Check className="w-2.5 h-2.5" style={{ color: ACCENT }} />
                  </span>
                  {f}
                </div>
              ))}
            </div>
            <Link
              href="/tailor"
              className="mt-9 inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-[0_8px_24px_rgba(220,79,51,0.3)] hover:-translate-y-0.5 transition-all"
              style={{ background: ACCENT }}
            >
              Try the beta — free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-4 text-[12px] text-gray-400">No card needed · magic-link sign-in · your feedback shapes what ships next</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ── Final CTA + footer ───────────────────────────────────────────────────

function Footer() {
  const cols: [string, string[]][] = [
    ["Product", ["How it works", "Features", "Beta"]],
    ["Company", ["About", "Blog", "Contact"]],
    ["Legal", ["Privacy", "Terms", "Data & security"]],
  ]
  return (
    <footer style={{ background: INK }}>
      <div className="max-w-6xl mx-auto px-5 pt-20 pb-16 text-center border-b border-white/10">
        <h2 className="text-[clamp(30px,5vw,52px)] font-extrabold tracking-[-0.025em] leading-tight text-white">
          The next job won&apos;t <span style={{ color: ACCENT }}>tailor itself</span>.
        </h2>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/tailor"
            className="inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-semibold text-white rounded-xl hover:-translate-y-0.5 transition-all"
            style={{ background: ACCENT }}
          >
            Tailor my CV — free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#beta" className="inline-flex items-center px-7 py-3.5 text-[15px] font-semibold text-white rounded-xl border border-white/20 hover:border-white/40 transition-all">
            About the beta
          </a>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-5 py-14 grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
        <div className="col-span-2 md:col-span-1">
          <Wordmark light />
          <p className="mt-4 text-[14px] text-white/50 leading-relaxed max-w-[32ch]">
            Tailored CVs for every job worth applying to. Tailor, score, prep, track.
          </p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <p className={`${jetbrains.className} text-[10px] uppercase tracking-[0.16em] text-white/40`}>{h}</p>
            <ul className="mt-4 space-y-2.5">
              {links.map((l) => (
                <li key={l}>
                  <a href="#" className="text-[14px] text-white/70 hover:text-white transition-colors">{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="max-w-6xl mx-auto px-5 py-6 border-t border-white/10 flex items-center justify-between flex-wrap gap-3">
        <span className={`${jetbrains.className} text-[11px] text-white/40`}>© 2026 Tailr Labs</span>
        <span className={`${jetbrains.className} text-[11px] text-white/40`}>Cut to fit ✦ London</span>
      </div>
    </footer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div id="top" className={`${hanken.className} ${hanken.variable} ${jetbrains.variable} bg-white antialiased`} style={{ color: INK }}>
      <Nav />
      <main>
        <Hero />
        <Stats />
        <HowItWorks />
        <Modules />
        <Benefits />
        <Beta />
      </main>
      <Footer />
    </div>
  )
}
