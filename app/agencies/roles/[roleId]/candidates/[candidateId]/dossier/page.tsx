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
import type { Dossier, Layer, RequirementStrata } from "@/lib/agency/dossier"

/** Provenance ramp, matching the frame: sand → amber → coral → ink. The
 * deeper the colour, the more recently that layer moved the requirement. */
const LAYER_TONE: Record<string, string> = {
  cv: "#b09a7a",
  screening: "#c97a2f",
  round: "#dc4f33",
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
