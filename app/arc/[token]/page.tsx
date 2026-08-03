import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { buildPublicArc, isValidShareToken, type PublicArc, type ShareSettings } from '@/lib/career-arc-share'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import type { CareerProfileSections } from '@/lib/anthropic'

/**
 * The public, read-only Career Arc (rebuild stage 3, screen 06).
 *
 * Server component only: the token is the capability, lookups run through the
 * service role, and the page renders exclusively from buildPublicArc's
 * redacted projection — nothing redacted is ever serialized to the client.
 * Missing, revoked and expired tokens are all the same 404 (no oracle).
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // Deliberately generic: no name in the title, ever.
  title: 'A Career Arc — Tailr',
  description: 'An evidence-first career record. Nothing invented.',
  robots: { index: false, follow: false },
}

const ACCENT = '#dc4f33'
const INK = '#1e1813'
const SAND_LT = '#ece2d6'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function loadPublicArc(token: string): Promise<PublicArc | null> {
  if (!isValidShareToken(token)) return null
  const admin = createAdminClient()

  const { data: share } = await admin
    .from('career_arc_shares')
    .select('user_id, claim_redactions, first_name_only, hide_employers, hide_dates, include_break, expires_at, revoked, created_at')
    .eq('token', token)
    .maybeSingle()
  if (!share || share.revoked) return null
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return null

  const [{ data: profile }, { data: evidence }] = await Promise.all([
    admin.from('career_profiles').select('sections').eq('user_id', share.user_id).maybeSingle(),
    admin.from('career_evidence').select('*').eq('user_id', share.user_id),
  ])
  if (!profile?.sections?.identity) return null

  const settings: ShareSettings = {
    claimRedactions: (share.claim_redactions ?? {}) as ShareSettings['claimRedactions'],
    firstNameOnly: share.first_name_only,
    hideEmployers: share.hide_employers,
    hideDates: share.hide_dates,
    includeBreak: share.include_break,
  }

  // Fire-and-forget view count; never blocks or fails the render.
  admin.rpc('increment_arc_share_views', { p_token: token }).then(() => {}, () => {})

  return buildPublicArc({
    sections: profile.sections as CareerProfileSections,
    evidence: (evidence ?? []) as EvidenceRow[],
    settings,
    sharedOn: fmtDate(share.created_at),
    expiresOn: share.expires_at ? fmtDate(share.expires_at) : null,
  })
}

/** Server-rendered staircase chart from redaction-applied nodes (screen 06). */
function PublicPathChart({ nodes }: { nodes: PublicArc['nodes'] }) {
  const n = nodes.length
  const W = 980, H = 240, X0 = 110, X1 = 800, Y0 = 195, Y1 = 60
  const pts = nodes.map((node, i) => ({
    ...node,
    x: X0 + (i * (X1 - X0)) / (n - 1),
    y: Y0 - (i * (Y0 - Y1)) / (n - 1),
  }))
  let d = `M 40 ${pts[0].y} H ${pts[0].x}`
  for (let i = 1; i < n; i++) {
    const riser = Math.min(34, (pts[i].x - pts[i - 1].x) * 0.35)
    d += ` H ${Math.round(pts[i].x - riser)} L ${Math.round(pts[i].x - riser / 2.4)} ${pts[i].y} H ${pts[i].x}`
  }
  const halo = { paintOrder: 'stroke' as const, stroke: '#fff', strokeWidth: 4, strokeLinejoin: 'round' as const }
  const short = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t)
  const maxChars = Math.max(12, Math.floor((X1 - X0) / (n - 1) / 6.5) + 6)
  return (
    <div className="rounded-2xl border bg-white px-5 pb-3 pt-5" style={{ borderColor: SAND_LT }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Career path chart">
        <path d={d} fill="none" stroke={ACCENT} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            {p.isCurrent ? (
              <>
                <circle cx={p.x} cy={p.y} r={10} fill={ACCENT} />
                <circle cx={p.x} cy={p.y} r={17} fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={0.4} />
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r={8} fill="#fff" stroke={ACCENT} strokeWidth={4} />
            )}
            <text x={p.x} y={p.y + 24} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={INK} style={halo}>{short(p.title, maxChars)}</text>
            {p.company && (
              <text x={p.x} y={p.y + 38} textAnchor="middle" fontSize={10} fontWeight={500} fill="#a89e93" style={halo}>{short(p.company, maxChars + 6)}</text>
            )}
            {p.year && (
              <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize={9.5} fill="#55504a" className="font-mono" style={halo}>{p.year}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

/** Render a claim, converting ⟪…⟫ band markers to the coral-dotted style. */
function ClaimText({ text }: { text: string }) {
  const parts = text.split(/(⟪[^⟫]*⟫)/)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('⟪') ? (
          <em key={i} className="not-italic font-bold" style={{ color: ACCENT, borderBottom: `2px dotted ${ACCENT}` }}>
            {part.slice(1, -1)}
          </em>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export default async function PublicArcPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const arc = await loadPublicArc(token)
  if (!arc) notFound()

  const first = arc.displayName || 'This person'

  return (
    <div className="min-h-screen" style={{ background: '#f9f6f0' }}>
      {/* Trust banner */}
      <div className="border-b px-4 py-3" style={{ background: INK, borderColor: '#3a332c' }}>
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-x-5 gap-y-1">
          <span className="rounded border-2 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.18em]" style={{ borderColor: ACCENT, color: ACCENT }}>
            NOTHING INVENTED
          </span>
          <p className="text-[12.5px]" style={{ color: '#cfc8bf' }}>
            <b style={{ color: '#f9f6f0' }}>{arc.cards.length} proof{arc.cards.length === 1 ? '' : 's'} shared.</b>{' '}
            Extracted from a CV — nothing added, nothing embellished. {first} chose what to share.
          </p>
          {arc.expiresOn && (
            <span className="ml-auto font-mono text-[10px] tracking-[0.14em]" style={{ color: '#8a8178' }}>
              LINK EXPIRES {arc.expiresOn.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 py-8">
        <div className="overflow-hidden rounded-3xl border shadow-[0_16px_48px_rgba(30,24,19,0.10)]" style={{ background: '#fdfcf9', borderColor: '#e0d6c9' }}>
          <div className="relative border-b px-6 pb-7 pt-9 sm:px-12" style={{ borderColor: SAND_LT }}>
            <h1 className="text-[28px] font-black tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
              {arc.displayName}<span style={{ color: ACCENT }}>.</span>
            </h1>
            <div className="mt-3.5 flex flex-wrap gap-x-7 gap-y-1.5">
              {arc.period && (
                <span className="font-mono text-[11px] tracking-[0.08em] text-[#8a8178]">PERIOD <b className="font-medium text-[#55504a]">{arc.period}</b></span>
              )}
              <span className="font-mono text-[11px] tracking-[0.08em] text-[#8a8178]">BASIS <b className="font-medium text-[#55504a]">evidence-first · nothing invented</b></span>
              <span className="font-mono text-[11px] tracking-[0.08em] text-[#8a8178]">SHOWING <b className="font-medium text-[#55504a]">what {first} chose to share</b></span>
            </div>
            <div className="absolute right-6 top-8 hidden -rotate-[11deg] rounded-lg border-[3px] px-4 pb-2 pt-2 text-center opacity-90 sm:right-11 md:block" style={{ borderColor: ACCENT, color: ACCENT }}>
              <div className="font-mono text-[15px] font-bold tracking-[0.22em]">NOTHING INVENTED</div>
              <div className="mt-0.5 font-mono text-[8px] tracking-[0.16em]">SHARED {arc.sharedOn.toUpperCase()}</div>
            </div>
          </div>

          {arc.glance.length > 0 && (
            <section className="border-b px-6 py-7 sm:px-12" style={{ borderColor: SAND_LT }}>
              <div className="mb-4.5 flex items-baseline gap-3">
                <h2 className="font-mono text-[12px] font-bold tracking-[0.22em]" style={{ color: INK }}>AT A GLANCE</h2>
                {arc.employersHidden && <span className="ml-auto text-[12px] text-[#a89e93]">employer names hidden by {first}</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {arc.glance.map((st, i) => (
                  <div key={i} className="rounded-2xl border bg-white px-5 py-4" style={{ borderColor: SAND_LT }}>
                    <p className="text-[30px] font-extrabold tabular-nums leading-none" style={{ color: ACCENT }}>{st.value}</p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8178]">{st.label}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(arc.nodes.length >= 3 || arc.chapters.length > 0) && (
            <section className="border-b px-6 py-7 sm:px-12" style={{ borderColor: SAND_LT }}>
              <div className="mb-4.5 flex items-baseline gap-3">
                <h2 className="font-mono text-[12px] font-bold tracking-[0.22em]" style={{ color: INK }}>THE PATH</h2>
                <span className="ml-auto text-[12px] text-[#a89e93]">chapters, not levels</span>
              </div>
              {arc.nodes.length >= 3 && <PublicPathChart nodes={arc.nodes} />}
              <div className={arc.nodes.length >= 3 ? 'mt-3 space-y-2.5' : 'space-y-2.5'}>
                {(arc.nodes.length >= 3 ? arc.chapters.filter((ch) => ch.isBreak) : arc.chapters).map((ch, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-5 py-4"
                    style={ch.isBreak ? { background: '#fff7f4', borderColor: '#f5d9d0' } : { background: '#fff', borderColor: SAND_LT }}
                  >
                    {ch.span && <span className="w-28 shrink-0 font-mono text-[11px] tracking-[0.08em] text-[#55504a]">{ch.span}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold" style={{ color: INK }}>{ch.name}</p>
                      {ch.summary && <p className="text-[12.5px] text-[#8a8178]">{ch.summary}</p>}
                    </div>
                    {ch.isBreak && (
                      <span className="rounded-full border px-3 py-1 font-mono text-[9.5px] tracking-[0.14em]" style={{ borderColor: '#f5d9d0', color: ACCENT }}>
                        A CHAPTER · NOT A GAP
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="border-b px-6 py-7 sm:px-12" style={{ borderColor: SAND_LT }}>
            <div className="mb-4.5 flex items-baseline gap-3">
              <h2 className="font-mono text-[12px] font-bold tracking-[0.22em]" style={{ color: INK }}>
                EVIDENCE · WHAT {first.toUpperCase()} CHOSE TO SHARE
              </h2>
              <span className="ml-auto text-[12px] text-[#a89e93]">every claim traceable to a CV</span>
            </div>
            {arc.cards.length === 0 ? (
              <p className="text-[13px] text-[#a89e93]">No claims shared yet.</p>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {arc.cards.map((card, i) => (
                  <div key={i} className="rounded-[18px] border bg-white px-5 py-5" style={{ borderColor: SAND_LT }}>
                    <span className="font-mono text-[9.5px] tracking-[0.2em] text-[#8a8178]">{card.category.toUpperCase()}</span>
                    <p className="mt-2 text-[14.5px] font-semibold leading-[1.5]" style={{ color: INK }}>
                      <ClaimText text={card.text} />
                    </p>
                    {(card.sourceRole || card.sourceCompany) && (
                      <div className="mt-3.5">
                        <span className="rounded-full border px-3 py-1 font-mono text-[10.5px]" style={{ background: '#fff7f4', borderColor: '#f5d9d0', color: INK }}>
                          {[card.sourceRole, card.sourceCompany].filter(Boolean).join(' · ').toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {arc.anyBanded && (
              <p className="mt-4 text-[12px] leading-relaxed text-[#a89e93]">
                Coral-dotted text has been generalised by {first} — the fact is real; the specificity was their choice. Ask them for the numbers.
              </p>
            )}
          </section>

          <div className="px-6 py-10 text-center sm:px-12" style={{ background: INK }}>
            <h2 className="text-[22px] font-black" style={{ color: '#f9f6f0' }}>
              Your career has an arc, too<span style={{ color: ACCENT }}>.</span>
            </h2>
            <p className="mx-auto mt-2 max-w-[36rem] text-[13px] leading-relaxed" style={{ color: '#8a8178' }}>
              Tailr builds a private evidence bank from your CV. Nothing generated, embellished, or invented on top.
            </p>
            <Link
              href="/tailor"
              className="mt-5 inline-block rounded-[10px] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_18px_rgba(220,79,51,0.28)] transition-all hover:brightness-105"
              style={{ background: ACCENT }}
            >
              Build my Career Arc →
            </Link>
            <p className="mt-4 font-mono text-[9.5px] tracking-[0.18em]" style={{ color: '#6b6259' }}>TAILR · NOTHING INVENTED</p>
          </div>
        </div>
      </div>
    </div>
  )
}
