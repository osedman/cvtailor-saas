"use client"

/**
 * The living dossier — Figma "HM · Living dossier — stratigraphy v2".
 *
 * The argument of this screen is that certainty is earned in layers, and you
 * can see which layer earned it. Everything below is a real row: the CV said
 * one thing, a recruiter overrode it and said why, a round added a written
 * answer. Nothing is inferred and nothing is averaged.
 *
 * Three parts carried over from the frame, each doing work:
 *   - the CORE SAMPLE: one block per requirement, coloured by the layer that
 *     last moved it, so ten of eleven proven reads in a glance;
 *   - the WATERFALL: where the score started and where it is now, because a
 *     number that only ever goes up should show its arithmetic;
 *   - STILL UNKNOWN: the inverse counter, front and centre. Every competitor
 *     accumulates positives; the honest thing is a number that only shrinks.
 *
 * WHY IT IS SHALLOW TODAY, SAID ON THE SCREEN. Transcript enrichment sits
 * behind the DPIA gate, so no requirement has interview-origin evidence yet
 * and most strata run two deep. The banner says so rather than letting a thin
 * dossier read as a shallow candidate — and it disappears on its own the day
 * enrichment ships, because it is driven by the data, not a flag.
 *
 * Recruiter-side: a dossier is the recruiter's working. See the header of
 * lib/agency/dossier.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { SignOut } from "@/components/agency/sign-out"
import type { Dossier, Layer, RequirementStrata } from "@/lib/agency/dossier"
// Pure function, no server imports — safe in the browser, and the reason the
// delta logic is unit-tested without mocking a single query.
import { deltaForRound, type DeltaItem } from "@/lib/agency/round-delta"

/** Provenance ramp, matching the frame: sand → amber → coral → ink. The
 * deeper the colour, the more recently that layer moved the requirement. */
// Tokens, not literals: these have to follow light/dark, and a hex here
// stays a light-ground hue on a dark ground.
const LAYER_TONE: Record<string, string> = {
  cv: "var(--ag-ink-4)",
  screening: "var(--ag-warn-mark)",
  round: "var(--ag-coral)",
}

const STRENGTH_LABEL: Record<string, string> = {
  strong: "Strong",
  transferable: "Transferable",
  partial: "Partial",
  missing: "Missing",
}

function fmt(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export default function DossierPage({
  params,
}: {
  params: Promise<{ roleId: string; candidateId: string }>
}) {
  const { roleId, candidateId } = use(params)
  const router = useRouter()
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Which round's delta is on screen. Null = the whole dossier. */
  const [deltaRound, setDeltaRound] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/candidates/${candidateId}/dossier`)
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "Could not load this dossier.")
        return
      }
      const body = await res.json()
      setDossier(body.dossier ?? null)
    } catch {
      setError("Could not load this dossier.")
    }
  }, [roleId, candidateId, router])

  useEffect(() => {
    void load()
  }, [load])

  const d = dossier
  const proven = d ? d.unknown.total - d.unknown.open : 0

  return (
    <>
      <aside className="ag-sidebar">
        <button
          className="ag-brand"
          style={{ border: "none", background: "none", cursor: "pointer" }}
          onClick={() => router.push("/agencies")}
        >
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <div>
          <div className="ag-rail-label">Navigate</div>
          <button className="ag-step" onClick={() => router.push("/agencies")}>Roles</button>
          <button className="ag-step" onClick={() => router.push(`/agencies/roles/${roleId}`)}>This role</button>
          <button className="ag-step on" aria-current="page">Dossier</button>
        </div>
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Earned, not assumed</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Every layer here is a row someone wrote. Nothing is inferred, and the unknown count
            only ever goes down.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <button className="ag-crumb-link" onClick={() => router.push(`/agencies/roles/${roleId}`)}>
                {d?.role.ref || "Role"}
              </button>
              {" / "}
              <b>Dossier</b>
            </span>
          </div>

          {error && <p className="ag-banner" role="alert">{error}</p>}
          {!d && !error && <p className="ag-quiet" aria-live="polite">Loading…</p>}

          {d && (
            <>
              <p className="ag-step-eyebrow">Candidate dossier · deepens every round</p>
              <h1 className="ag-title">{d.candidate.name}</h1>
              <p className="ag-sub">
                {d.role.title} · {d.candidate.ref} · every line below traces to a quote, a
                recruiter&apos;s call, or an explicit gap.
              </p>

              {/* Driven by the data, not a flag: it disappears when the first
                  interview-origin evidence row exists. */}
              {d.enrichmentPending && (
                <p className="ag-callout ag-book-warn">
                  Interview enrichment is not built yet, so nothing here has been drawn from a
                  recorded round. These layers are the CV, the recruiter&apos;s screening calls and
                  any written-up answers. The dossier deepens on its own when capture ships.
                </p>
              )}

              {d.rounds.length > 0 && (
                <section className="ag-card ag-delta" aria-labelledby="delta">
                  <div className="ag-card-head" style={{ padding: 0, border: "none" }}>
                    <span className="ag-card-title" id="delta">What a round added</span>
                    <span className="ag-grow" />
                    <div className="ag-filters" style={{ margin: 0 }}>
                      {d.rounds.map((r) => (
                        <button
                          key={r.id}
                          className={`ag-chip${deltaRound === r.number ? " on" : ""}`}
                          onClick={() => setDeltaRound(deltaRound === r.number ? null : r.number)}
                          aria-pressed={deltaRound === r.number}
                        >
                          Round {r.number}
                        </button>
                      ))}
                    </div>
                  </div>
                  {deltaRound === null ? (
                    <p className="ag-note" style={{ marginTop: 10 }}>
                      Pick a round to see what it moved — what it reached first, what it revisited,
                      and what it left open.
                    </p>
                  ) : (
                    <RoundDeltaView d={d} n={deltaRound} />
                  )}
                </section>
              )}

              <div className="ag-dossier-grid">
                <aside className="ag-stack" style={{ gap: 16 }}>
                  {/* Still unknown — the inverse counter */}
                  <section className="ag-card ag-unknown">
                    <p className="ag-field-label" style={{ color: "inherit", opacity: 0.75 }}>
                      Still unknown
                    </p>
                    <p className="ag-unknown-n">
                      {d.unknown.open} of {d.unknown.total}
                    </p>
                    <p className="ag-note" style={{ color: "inherit", opacity: 0.8 }}>
                      {d.unknown.open === 0
                        ? "Everything asked for has been evidenced."
                        : "requirements still unproven. This number only ever goes down."}
                    </p>
                  </section>

                  {/* Core sample */}
                  <section className="ag-card" style={{ padding: "18px 20px" }}>
                    <p className="ag-field-label">
                      The core sample — {proven} of {d.unknown.total} proven
                    </p>
                    <div className="ag-stack" style={{ gap: 6, marginTop: 10 }}>
                      {d.requirements.map((r) => (
                        <div key={r.requirementId} className="ag-core-row">
                          <span className="ag-meta ag-core-ref">{r.ref}</span>
                          <span
                            className={`ag-core-block${r.open ? " open" : ""}`}
                            style={
                              r.open
                                ? undefined
                                : { background: LAYER_TONE[r.layers[r.layers.length - 1]?.kind ?? "cv"] }
                            }
                            aria-hidden
                          />
                          <span className="ag-core-name">{r.text}</span>
                        </div>
                      ))}
                    </div>
                    <p className="ag-note" style={{ marginTop: 10 }}>
                      Each block is a requirement, coloured by the layer that last moved it. Open
                      ones are dashed until they are not.
                    </p>
                  </section>

                  {/* Waterfall */}
                  {d.score && d.score.overall !== null && (
                    <section className="ag-card" style={{ padding: "18px 20px" }}>
                      <p className="ag-field-label">
                        {Math.round(d.score.overall)} — how it was earned
                      </p>
                      <div className="ag-fall" style={{ marginTop: 10 }}>
                        <span
                          className="ag-fall-seg"
                          style={{
                            width: `${((d.score.original ?? d.score.overall) / d.score.overall) * 100}%`,
                            background: LAYER_TONE.cv,
                          }}
                        />
                        {d.score.original !== null && d.score.overall > d.score.original && (
                          <span
                            className="ag-fall-seg"
                            style={{
                              width: `${((d.score.overall - d.score.original) / d.score.overall) * 100}%`,
                              background: LAYER_TONE.screening,
                            }}
                          />
                        )}
                      </div>
                      <p className="ag-note" style={{ marginTop: 8 }}>
                        {d.score.original === null
                          ? "No pre-screening score recorded."
                          : `${Math.round(d.score.original)} at parse, ${Math.round(d.score.overall - d.score.original)} added by screening. No round ever subtracts.`}
                      </p>
                    </section>
                  )}
                </aside>

                {/* Stratigraphy */}
                <section className="ag-stack" style={{ gap: 12 }} aria-label="Evidence stratigraphy">
                  <p className="ag-field-label">Evidence stratigraphy — how each requirement deepened</p>
                  {d.requirements.map((r) => (
                    <StrataRow key={r.requirementId} r={r} />
                  ))}
                </section>
              </div>

              <p className="ag-note-quiet" style={{ marginTop: 28 }}>
                Sand → amber → coral: the deeper the colour, the more recently that layer moved the
                requirement. Every cell is a quote, an attributed human call, or an explicit gap.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  )
}

function StrataRow({ r }: { r: RequirementStrata }) {
  return (
    <article className="ag-card ag-strata">
      <div className="ag-strata-head">
        <span className="ag-meta">{r.ref}</span>
        <span className="ag-strata-title">{r.text}</span>
        <span className="ag-grow" />
        <span className="ag-meta">{r.weight}</span>
        <span className={`ag-pill${r.open ? "" : " on"}`}>{STRENGTH_LABEL[r.current]}</span>
      </div>

      {r.layers.length === 0 ? (
        <p className="ag-note">
          Nothing has evidenced this yet — not claimed, not inferred, not filled in.
        </p>
      ) : (
        <div className="ag-stack" style={{ gap: 8, marginTop: 8 }}>
          {r.layers.map((l, i) => (
            <LayerRow key={`${l.kind}-${i}`} l={l} />
          ))}
        </div>
      )}
    </article>
  )
}

function LayerRow({ l }: { l: Layer }) {
  return (
    <div className="ag-layer">
      <span className="ag-layer-rail" style={{ background: LAYER_TONE[l.kind] }} aria-hidden />
      <div className="ag-grow" style={{ minWidth: 0 }}>
        <span className="ag-meta">
          {l.label}
          {l.strength ? ` · ${STRENGTH_LABEL[l.strength]}` : ""}
          {l.at ? ` · ${fmt(l.at)}` : ""}
        </span>
        {/* A recruiter's override is the one layer that says what CHANGED, and
            it carries their reason. The compare matrix tints these for the same
            reason: a human's fingerprints are worth colouring. */}
        {l.kind === "screening" && l.from && l.to && (
          <p className="ag-layer-change">
            was {STRENGTH_LABEL[l.from].toLowerCase()} · now {STRENGTH_LABEL[l.to].toLowerCase()}
            {l.reason ? ` — ${l.reason}` : ""}
          </p>
        )}
        {l.quote && <p className="ag-layer-quote">{l.quote}</p>}
        {l.source && <span className="ag-meta">{l.source}</span>}
      </div>
    </div>
  )
}

/**
 * What one round moved.
 *
 * Four lanes, and the important one is REVISITED. The frame called that lane
 * CONTRADICTION because its example was one — but deciding that two statements
 * conflict is a judgement about meaning, and judgements belong to people. So
 * both layers are shown together, in the order they happened, with no verdict
 * attached. The recruiter reads them.
 */
function RoundDeltaView({ d, n }: { d: Dossier; n: number }) {
  const delta = deltaForRound(d, n)
  if (!delta) return null

  if (delta.empty && delta.stillOpen.length === 0) {
    return (
      <p className="ag-note" style={{ marginTop: 10 }}>
        Round {n} has not moved anything yet. When it is written up, what it reached will appear
        here.
      </p>
    )
  }

  return (
    <>
      <p className="ag-note" style={{ marginTop: 10 }}>
        {delta.artifact === "debrief"
          ? "Written up as notes — no recording was made."
          : delta.artifact === "transcript"
            ? "Drawn from the round's transcript."
            : "Not written up yet."}
        {delta.decision ? ` Decision: ${delta.decision}.` : ""}
      </p>
      <div className="ag-delta-grid">
        <DeltaLane title={`Added · ${delta.added.length}`} items={delta.added} tone="var(--ag-calm)" />
        <DeltaLane title={`Changed · ${delta.changed.length}`} items={delta.changed} tone="var(--ag-warn)" />
        <DeltaLane title={`Revisited · ${delta.revisited.length}`} items={delta.revisited} tone="var(--ag-coral-text)" />
        <DeltaLane title={`Still open · ${delta.stillOpen.length}`} items={delta.stillOpen} tone="var(--ag-ink-3)" />
      </div>
    </>
  )
}

function DeltaLane({ title, items, tone }: { title: string; items: DeltaItem[]; tone: string }) {
  return (
    <div>
      <p className="ag-delta-head" style={{ color: tone, borderColor: tone }}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="ag-note">Nothing.</p>
      ) : (
        <div className="ag-stack" style={{ gap: 10 }}>
          {items.map((it) => (
            <div key={`${it.lane}-${it.ref}`} className="ag-card ag-delta-card">
              <span className="ag-meta">
                {it.ref} · {it.weight}
              </span>
              <p className="ag-delta-req">{it.requirement}</p>
              {it.from && it.to && (
                <p className="ag-layer-change">
                  was {it.from} · now {it.to}
                </p>
              )}
              {/* Both sides, in the order they happened, with no verdict. */}
              {it.before?.quote && (
                <p className="ag-delta-before">
                  <span className="ag-meta">{it.before.label}</span> {it.before.quote}
                </p>
              )}
              {it.now?.quote && (
                <p className="ag-layer-quote">{it.now.quote}</p>
              )}
              {!it.now && !it.before?.quote && (
                <p className="ag-note">Nothing has evidenced this yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
