"use client"

import { useEffect, useState } from "react"

/**
 * Self-contained looping demo of the Career Path flow, for the landing page.
 * Four ~5s scenes on a 20s loop: spot the pattern, build the path, close the
 * gaps, lift the next tailor. Inherits the page font; cream/coral brand.
 */
export function CareerPathDemo() {
  const [active, setActive] = useState(0)
  const [num, setNum] = useState(68)

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % 4), 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (active !== 3) { setNum(68); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1300)
      setNum(Math.round(68 + (84 - 68) * p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    const to = setTimeout(() => { raf = requestAnimationFrame(tick) }, 300)
    return () => { clearTimeout(to); cancelAnimationFrame(raf) }
  }, [active])

  const cls = (i: number, extra: string) => `cpd-scene ${extra}${active === i ? " on" : ""}`

  return (
    <div className="cpd-root">
      <style>{CSS}</style>
      <div className="cpd-stage" role="img" aria-label="Career Path demo: it spots skills that keep coming up weak across your applications, builds a learning roadmap with free resources and a project for each, tracks you closing them, and feeds a closed skill back into your next tailor to lift the match score.">
        <div className="cpd-brand">
          <svg className="cpd-mark" viewBox="0 0 180 180" aria-hidden="true"><rect width="180" height="180" rx="40" fill="#1e1813" /><path d="M92 50 V116 q0 16 16 16 H122" fill="none" stroke="#f9f6f0" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" /><path d="M66 76 H120" fill="none" stroke="#f9f6f0" strokeWidth="15" strokeLinecap="round" /><circle cx="128" cy="50" r="10.5" fill="#dc4f33" /></svg>
          <span className="cpd-word">tailr<span className="cpd-dot" /></span>
        </div>

        <div className={cls(0, "s1")}>
          <p className="cpd-kicker">It watches every tailor</p>
          <h3 className="cpd-h">It spots the pattern.</h3>
          <div className="cpd-banner">
            <span className="cpd-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc4f33" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v6M21 7h-6" /></svg></span>
            <p><b>Pattern spotted:</b> SQL keeps coming up as a weak spot across your last 5 applications.</p>
          </div>
        </div>

        <div className={cls(1, "s2")}>
          <p className="cpd-kicker">Free resources · a project · the CV line</p>
          <h3 className="cpd-h">So it builds you a path.</h3>
          <div className="cpd-cards">
            <div className="cpd-card">
              <div className="cpd-top"><h4>SQL</h4><span className="cpd-pill">not started</span></div>
              <p className="cpd-why">Named in most roles you target; your CV only hints at it.</p>
              <div className="cpd-res"><span>freeCodeCamp</span><span>Khan Academy</span></div>
            </div>
            <div className="cpd-card">
              <div className="cpd-top"><h4>Stakeholders</h4><span className="cpd-pill">not started</span></div>
              <p className="cpd-why">Senior roles want evidence you can align people.</p>
              <div className="cpd-res"><span>MIT OCW</span><span>Coursera</span></div>
            </div>
          </div>
        </div>

        <div className={cls(2, "s3")}>
          <p className="cpd-kicker">Learn it, build the project, mark it done</p>
          <h3 className="cpd-h">You close the gaps.</h3>
          <div className="cpd-prog">
            <span className="cpd-status"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>
            <div className="cpd-track"><div className="cpd-fill" /></div>
            <span className="cpd-count">2 of 3 done</span>
          </div>
          <p className="cpd-sub">Each closed skill becomes evidenced proof on your CV.</p>
        </div>

        <div className={cls(3, "s4")}>
          <p className="cpd-kicker">The loop closes</p>
          <div className="cpd-ring-wrap">
            <div className="cpd-ring">
              <svg width="130" height="130" viewBox="0 0 130 130"><circle className="cpd-bg" cx="65" cy="65" r="54" /><circle className="cpd-arc" cx="65" cy="65" r="54" /></svg>
              <div className="cpd-val"><span className="cpd-num">{num}</span><span className="cpd-cap">Match</span></div>
            </div>
            <div className="cpd-fb">
              <h3 className="cpd-h" style={{ fontSize: "22px" }}>It lifts your next tailor.</h3>
              <p className="cpd-sub">A gap you&apos;ve closed flows straight back in, so a real skill you fixed raises your match.</p>
            </div>
          </div>
        </div>

        <div className="cpd-dots">{[0, 1, 2, 3].map((i) => <i key={i} className={active === i ? "on" : ""} />)}</div>
      </div>
    </div>
  )
}

const CSS = `
.cpd-root{--coral:#dc4f33;--ink:#1e1813;--cream:#f9f6f0;--oat:#efe9dd;--line:#ece6da;--muted:#8a8177;--white:#fff;--green:#16a34a;}
.cpd-stage{position:relative;width:100%;max-width:880px;margin:0 auto;aspect-ratio:16/9;background:var(--cream);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(30,24,19,.10);}
.cpd-brand{position:absolute;top:18px;left:22px;display:flex;align-items:center;gap:7px;z-index:20;}
.cpd-mark{width:23px;height:23px;border-radius:7px;}
.cpd-word{font-weight:800;letter-spacing:-.02em;font-size:16px;color:var(--ink);display:inline-flex;align-items:baseline;gap:2px;}
.cpd-dot{width:5.5px;height:5.5px;border-radius:50%;background:var(--coral);display:inline-block;transform:translateY(-1px);}
.cpd-scene{position:absolute;inset:0;padding:58px 46px 40px;display:flex;flex-direction:column;justify-content:center;opacity:0;transform:translateY(9px);transition:opacity .55s ease,transform .55s ease;pointer-events:none;}
.cpd-scene.on{opacity:1;transform:none;}
.cpd-kicker{font-size:12px;font-weight:700;color:var(--coral);margin:0 0 8px;}
.cpd-h{font-size:27px;font-weight:800;letter-spacing:-.03em;line-height:1.08;margin:0;color:var(--ink);max-width:17ch;}
.cpd-sub{font-size:13px;color:var(--muted);margin:8px 0 0;max-width:42ch;line-height:1.5;}
.cpd-banner{display:flex;align-items:center;gap:12px;background:#fff7f4;border:1px solid #f5c9bb;border-radius:14px;padding:15px 17px;max-width:600px;margin-top:18px;}
.cpd-ic{flex:none;width:34px;height:34px;border-radius:10px;background:var(--white);border:1px solid #f5c9bb;display:flex;align-items:center;justify-content:center;}
.cpd-banner p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink);}
.cpd-banner b{color:var(--coral);}
.cpd-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;}
.cpd-card{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:0 2px 12px rgba(30,24,19,.04);}
.cpd-top{display:flex;align-items:center;justify-content:space-between;}
.cpd-card h4{margin:0;font-size:15px;font-weight:800;color:var(--ink);}
.cpd-pill{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:20px;background:#fff7f4;color:var(--coral);}
.cpd-why{font-size:11.5px;color:var(--muted);line-height:1.45;margin:7px 0 0;}
.cpd-res{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;}
.cpd-res span{font-size:10px;font-weight:600;color:#5f5a52;background:#f4f1ea;border:1px solid var(--line);border-radius:7px;padding:3px 8px;}
.cpd-prog{display:flex;align-items:center;gap:14px;margin-top:18px;max-width:600px;}
.cpd-status{flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--white);border:2px dashed var(--coral);transition:background .4s,border-color .4s;}
.cpd-status svg{width:20px;height:20px;opacity:0;transition:opacity .3s;}
.cpd-track{flex:1;height:8px;border-radius:20px;background:var(--oat);overflow:hidden;}
.cpd-fill{height:100%;width:0;border-radius:20px;background:linear-gradient(90deg,var(--coral),#f4795c);transition:width 1.1s cubic-bezier(.4,0,.2,1);}
.cpd-count{font-size:12.5px;font-weight:700;color:var(--ink);min-width:70px;}
.cpd-scene.on.s3 .cpd-fill{width:66%;}
.cpd-scene.on.s3 .cpd-status{background:var(--green);border-color:var(--green);border-style:solid;}
.cpd-scene.on.s3 .cpd-status svg{opacity:1;}
.cpd-ring-wrap{display:flex;align-items:center;gap:28px;margin-top:16px;}
.cpd-ring{position:relative;width:130px;height:130px;flex:none;}
.cpd-ring svg{transform:rotate(-90deg);}
.cpd-val{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.cpd-num{font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--ink);}
.cpd-cap{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-top:2px;}
.cpd-arc{stroke:var(--coral);stroke-width:12;fill:none;stroke-linecap:round;stroke-dasharray:339;stroke-dashoffset:339;transition:stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1);}
.cpd-bg{stroke:var(--oat);stroke-width:12;fill:none;}
.cpd-scene.on.s4 .cpd-arc{stroke-dashoffset:54;}
.cpd-dots{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:20;}
.cpd-dots i{width:6px;height:6px;border-radius:50%;background:#f5c9bb;transition:width .4s,background .4s;}
.cpd-dots i.on{width:20px;background:var(--coral);border-radius:20px;}
@media (max-width:560px){.cpd-scene{padding:48px 22px 36px;}.cpd-h{font-size:20px;}.cpd-cards{gap:9px;}.cpd-card{padding:11px 12px;}}
@media (prefers-reduced-motion:reduce){.cpd-scene,.cpd-fill,.cpd-status,.cpd-arc,.cpd-dots i{transition:none;}}
`
