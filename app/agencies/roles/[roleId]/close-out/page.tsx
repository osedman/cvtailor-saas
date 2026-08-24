"use client"

/**
 * Close-out — references, then the handover pack.
 *
 * Built to the signed-off frame "Recruiter · Close-out: references + handover"
 * (Figma: Tailr — Hiring Manager Concept, page 02).
 *
 * This is the last screen in the loop, and its argument is in the rail: when
 * the hire is made, Tailr forgets. Handing the pack over is the moment the
 * employer becomes controller of what they hold and the role's retention clock
 * starts on everyone who did not get the job.
 *
 * Two things here are product decisions rather than layout:
 *   - The referee note stays. Referees are third parties whose details reached
 *     us from the candidate; the request and the fair-processing notice are the
 *     same email, and this screen says so rather than letting a recruiter think
 *     they are just sending a form.
 *   - The pack preview shows GAPS. An employer inheriting this person is
 *     entitled to what was never evidenced, and a close-out screen that only
 *     showed strengths would be selling rather than handing over.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { SignOut } from "@/components/agency/sign-out"
import { PhaseRail } from "@/components/agency/phase-rail"
import { CandidateReferences, type ReferenceListRow } from "@/components/agency/candidate-references"
import { type PhaseKey } from "@/lib/agency/phases"
import type { HandoverSnapshot } from "@/lib/agency/handover"

interface Candidate {
  id: string
  ref: string
  full_name: string
}

/** The document's vocabulary — the same words the app uses everywhere else,
 * because a pack that renames things at the door is a pack that needs a
 * glossary. Machine values never print raw. */
const STRENGTH_LABEL: Record<string, string> = {
  strong: "strong evidence",
  transferable: "transferable",
  partial: "partial",
}
const PROVENANCE_LABEL: Record<string, string> = {
  debrief: "written up by the interviewer",
  transcript: "transcribed with the candidate\u2019s consent",
  none: "no written record",
}
const DECISION_DOC_LABEL: Record<string, string> = {
  advance: "advanced",
  hold: "held",
  decline: "not advanced",
}

export default function CloseOutPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const router = useRouter()

  const [role, setRole] = useState<{ ref: string; title: string; company: string; status: string } | null>(null)
  /** Delivered packs collapse to a record line — the work is done and the
   *  screen should say so, not hold the full document open forever. */
  const [packOpen, setPackOpen] = useState(false)
  const [closure, setClosure] = useState<{ sent: number; deferred: number } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [chosenId, setChosenId] = useState("")
  const [refs, setRefs] = useState<ReferenceListRow[] | null>(null)
  const [pack, setPack] = useState<HandoverSnapshot | null>(null)
  const [packId, setPackId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Array<{ id: string; company: string; full_name: string }>>([])
  const [deliverTo, setDeliverTo] = useState("")
  const [deliveredTo, setDeliveredTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<PhaseKey | null>(null)

  const loadRole = useCallback(async () => {
    try {
      const [roleRes, candRes] = await Promise.all([
        fetch(`/api/agency/roles/${roleId}`),
        fetch(`/api/agency/roles/${roleId}/candidates`),
      ])
      if (roleRes.status === 401) return router.push("/agencies")
      if (roleRes.ok) {
        const body = await roleRes.json()
        setPhase((body?.phase as PhaseKey | null) ?? null)
        if (body?.role) {
          setRole({
            ref: body.role.ref,
            title: body.role.title,
            company: body.role.company ?? "",
            status: body.role.status ?? "draft",
          })
        }
      }
      if (candRes.ok) {
        const body = await candRes.json()
        setCandidates(Array.isArray(body?.candidates) ? body.candidates : [])
      }
      // The deciding contact, for handing the pack over. Non-fatal: without
      // contacts the pack still freezes; only the delivery control hides.
      fetch("/api/agency/contacts")
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => {
          const rows = Array.isArray(b?.contacts) ? b.contacts : []
          setContacts(rows)
          if (rows.length > 0) setDeliverTo((prev) => prev || rows[0].id)
        })
        .catch(() => {})
    } catch {
      setError("Could not load this role.")
    }
  }, [roleId, router])



  useEffect(() => {
    void loadRole()
  }, [loadRole])


  const chosen = candidates.find((c) => c.id === chosenId) ?? null

  /** Hand the frozen pack to the deciding contact. Idempotent server-side,
   *  audited as handover/delivered — the act that ends Tailr's part. */
  async function deliver() {
    if (!packId || !deliverTo) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/handover`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, contactId: deliverTo }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Delivery did not record")
      setDeliveredTo(deliverTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delivery did not record")
    } finally {
      setBusy(false)
    }
  }

  /** The end. Closing starts the retention clock (DB trigger) and tells
   *  everyone the loop was opened with — batched and paced server-side. */
  async function closeRole() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        closure?: { sent?: number; deferred?: number } | null
      }
      if (!res.ok) throw new Error(body.error ?? "Could not close the role")
      setRole((r) => (r ? { ...r, status: "closed" } : r))
      if (body.closure) setClosure({ sent: body.closure.sent ?? 0, deferred: body.closure.deferred ?? 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the role")
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    if (!chosenId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: chosenId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not generate the pack.")
        return
      }
      setPack(body.snapshot ?? null)
      setPackId(body.packId ?? null)
      if (body.deliveredToContactId) setDeliveredTo(body.deliveredToContactId)
    } finally {
      setBusy(false)
    }
  }

  const outstanding = (refs ?? []).filter((r) => r.status !== "received" && r.status !== "declined")

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
          <button className="ag-step" onClick={() => router.push("/agencies")}>Dashboard</button>
          <button className="ag-step" onClick={() => router.push("/agencies/candidates")}>Candidates</button>
          <button className="ag-step" onClick={() => router.push(`/agencies/roles/${roleId}`)}>This role</button>
          <button className="ag-step" onClick={() => router.push(`/agencies/roles/${roleId}/interviews`)}>Interviews</button>
          <button className="ag-step on" aria-current="page">Close-out</button>
        </div>
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>When the hire is made</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Handing over ends Tailr&apos;s part. The employer becomes responsible for the copy they
            hold, and the retention clock starts on everyone else.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Dashboard</button>
              {" / "}
              <button className="ag-crumb-link" onClick={() => router.push(`/agencies/roles/${roleId}`)}>
                {role?.ref || "Role"}
              </button>
              {" / "}
              <b>Close-out</b>
            </span>
            <span className="ag-grow" />
            <PhaseRail current={phase} roleId={roleId} />
            <button
              className="ag-btn ag-btn-secondary"
              onClick={() => router.push(`/agencies/roles/${roleId}/interviews`)}
            >
              ← Interviews
            </button>
          </div>

          <p className="ag-step-eyebrow">Close-out · after client selection</p>
          <h1 className="ag-title">
            {chosen ? `${role?.company || "Your client"} chose ${chosen.full_name}` : "Who did they choose?"}
          </h1>
          <p className="ag-sub">
            Collect references, hand over the pack, and Tailr&apos;s part is done. Everything the
            employer needs travels in one artefact — including what was never evidenced.
          </p>

          {error && <p className="ag-banner" role="alert">{error}</p>}

          {/* 1. Who was chosen */}
          <section className="ag-card ag-print-hide" style={{ padding: "18px 22px", marginTop: 8 }}>
            <p className="ag-field-label">The hire</p>
            {candidates.length === 0 ? (
              <p className="ag-note">No candidates on this role yet.</p>
            ) : (
              <div className="ag-stack" style={{ gap: 8, marginTop: 8 }}>
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    className={`ag-card ag-pick${chosenId === c.id ? " on" : ""}`}
                    onClick={() => {
                      setChosenId(c.id)
                      setPack(null)
                      setPackId(null)
                    }}
                    aria-pressed={chosenId === c.id}
                  >
                    <span className="ag-grow" style={{ minWidth: 0 }}>
                      <span className="ag-meta">{c.ref}</span>
                      <span className="ag-pick-name">{c.full_name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {chosen && (
            <div className="ag-close-grid">
              {/* 2. References */}
              {/* Shared with the candidate file (components/agency/
                  candidate-references.tsx). onRefsChange feeds the pack's
                  outstanding-references warning below. */}
              <div className="ag-stack" style={{ gap: 20 }}>
              <CandidateReferences candidateId={chosenId} onRefsChange={setRefs} />
              <section className="ag-card ag-print-hide" style={{ padding: "14px 22px" }}>
                <p className="ag-note" style={{ margin: 0 }}>
                  Right to work and the placement live on the{" "}
                  <button
                    className="ag-crumb-link"
                    style={{ font: "inherit", textDecoration: "underline" }}
                    onClick={() => router.push(`/agencies/candidates/${chosenId}`)}
                  >
                    candidate file
                  </button>
                  {" "}— completed there, they join the pack below.
                </p>
              </section>
              </div>

              {/* 3. The pack */}
              <section className="ag-card" style={{ padding: "18px 22px" }} aria-labelledby="pack">
                <div className="ag-card-head" style={{ padding: 0, border: "none" }}>
                  <span className="ag-card-title" id="pack">Handover pack</span>
                  <span className="ag-grow" />
                  {packId && <span className="ag-pill">Frozen</span>}
                </div>

                {!pack ? (
                  <>
                    <p className="ag-note" style={{ marginTop: 10 }}>
                      Generating freezes everything as it stands: the evidence dossier with its
                      quotes, the interview history, the references as given, and the gaps that
                      were never closed. It cannot change afterwards.
                    </p>
                    {outstanding.length > 0 && (
                      <p className="ag-note" style={{ color: "var(--ag-warn)" }}>
                        {outstanding.length} reference{outstanding.length === 1 ? "" : "s"} still
                        outstanding. You can hand over anyway — the pack will say so rather than
                        hide it.
                      </p>
                    )}
                    <button
                      className="ag-btn ag-btn-primary"
                      onClick={generate}
                      disabled={busy}
                      style={{ marginTop: 12 }}
                    >
                      {busy ? "Generating…" : "Generate the pack"}
                    </button>
                  </>
                ) : (
                  <div className="ag-pack">
                    {deliveredTo && !packOpen ? (
                      <div className="ag-handoff ag-print-hide" role="group" aria-label="Delivered pack">
                        <div className="ag-handoff-body">
                          <p className="ag-handoff-title">
                            The delivered pack is on record — frozen{" "}
                            {new Date(pack.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
                          </p>
                          <p className="ag-handoff-sub">
                            {pack.candidate.name} · {pack.role.title} · immutable since delivery.
                          </p>
                        </div>
                        <button className="ag-btn ag-btn-secondary" onClick={() => setPackOpen(true)}>
                          View the pack
                        </button>
                      </div>
                    ) : (
                    <>
                    {deliveredTo && (
                      <div className="ag-print-hide" style={{ marginBottom: 10 }}>
                        <button className="ag-btn ag-btn-secondary" onClick={() => setPackOpen(false)}>
                          ← File the pack away
                        </button>
                      </div>
                    )}
                    {/* The document itself, not a summary of it. This is what
                        the employer's HR team receives; the numbered sections
                        are its canonical reading order (evidence → how it was
                        gathered → what others said → what was never shown),
                        and printing it is the delivery format. */}
                    <div className="ag-doc" id="handover-doc">
                      <header className="ag-doc-head">
                        <div className="ag-doc-headrow">
                        <p className="ag-doc-eyebrow">
                          Handover record · {pack.role.ref} · {pack.candidate.ref}
                        </p>
                        <span className="ag-doc-seal" title="Frozen at generation — this document cannot change">
                          Frozen · {new Date(pack.generated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        </div>
                        <h2 className="ag-doc-name">{pack.candidate.name}</h2>
                        <p className="ag-doc-roleline">
                          for {pack.role.title} at {pack.role.company}
                          {pack.role.location ? ` · ${pack.role.location}` : ""}
                        </p>
                        <p className="ag-doc-prepared">
                          Prepared by {pack.agency}. Every claim below carries its source; where
                          there was no evidence, this document says so.
                        </p>
                      </header>

                      <section className="ag-doc-sec" aria-label="Evidence dossier">
                        <p className="ag-doc-sec-head"><span className="ag-doc-n">01</span> Evidence dossier</p>
                        <p className="ag-doc-sec-note">Verbatim quotes, mapped to the role&apos;s requirements. Nothing paraphrased.</p>
                        {pack.evidence.map((e, i) => (
                          <div className="ag-doc-ev" key={i}>
                            <p className="ag-doc-req">
                              {e.requirement}
                              <span className="ag-doc-chip">{e.weight}</span>
                              <span className="ag-doc-chip strength">{STRENGTH_LABEL[e.strength] ?? e.strength}</span>
                            </p>
                            {e.quote && (
                              <blockquote className="ag-doc-quote">
                                {e.quote}
                                {e.source && <cite>— {e.source}</cite>}
                              </blockquote>
                            )}
                          </div>
                        ))}
                        {pack.evidence.length === 0 && (
                          <p className="ag-doc-empty">No requirement was evidenced. Section 04 lists what was looked for.</p>
                        )}
                      </section>

                      {/* Packs frozen before 24 Aug 2026 have no compliance
                          key at all: a frozen document renders what it froze,
                          so the section simply is not there. From now on the
                          key is always present — null means "never recorded",
                          which the document says out loud. */}
                      {pack.compliance !== undefined && (
                        <section className="ag-doc-sec" aria-label="Right to work and logistics">
                          <p className="ag-doc-sec-head"><span className="ag-doc-n">02</span> Right to work &amp; logistics</p>
                          <p className="ag-doc-sec-note">
                            What the agency saw and what the candidate said — acts and reported
                            answers, never a ruling on anyone&apos;s status.
                          </p>
                          {pack.compliance === null ? (
                            <p className="ag-doc-empty">Nothing recorded. The employer must run its own check before employment starts.</p>
                          ) : (
                            <>
                              <p className="ag-doc-round">
                                <b>Evidence</b> · {pack.compliance.evidence}
                                {pack.compliance.checkedAt
                                  ? ` · checked ${new Date(pack.compliance.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
                                  : ""}
                                {pack.compliance.note ? ` — ${pack.compliance.note}` : ""}
                              </p>
                              {pack.compliance.expiresOn && (
                                <p className="ag-doc-round">
                                  <b>Permission expires</b> · {new Date(`${pack.compliance.expiresOn}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                                </p>
                              )}
                              <p className="ag-doc-round">
                                <b>Sponsorship</b> · {pack.compliance.sponsorship}
                              </p>
                              {pack.compliance.noticePeriod && (
                                <p className="ag-doc-round">
                                  <b>Notice period</b> · {pack.compliance.noticePeriod}
                                </p>
                              )}
                              <p className="ag-doc-empty">{pack.compliance.employerNotice}</p>
                            </>
                          )}
                        </section>
                      )}

                      <section className="ag-doc-sec" aria-label="Interview history">
                        <p className="ag-doc-sec-head"><span className="ag-doc-n">{pack.compliance !== undefined ? "03" : "02"}</span> Interview history</p>
                        <p className="ag-doc-sec-note">How each round was recorded, so every quote above has provenance.</p>
                        {pack.rounds.map((r) => (
                          <p className="ag-doc-round" key={r.number}>
                            <b>Round {r.number}</b>
                            {r.when ? ` · ${new Date(r.when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                            {" · "}
                            {PROVENANCE_LABEL[r.artifact ?? "none"] ?? "no written record"}
                            {r.decision ? ` · ${DECISION_DOC_LABEL[r.decision] ?? r.decision}` : ""}
                          </p>
                        ))}
                        {pack.rounds.length === 0 && <p className="ag-doc-empty">No interviews were held through Tailr.</p>}
                      </section>

                      <section className="ag-doc-sec" aria-label="References">
                        <p className="ag-doc-sec-head"><span className="ag-doc-n">{pack.compliance !== undefined ? "04" : "03"}</span> References</p>
                        <p className="ag-doc-sec-note">In the referee&apos;s words, attributed — never paraphrased.</p>
                        {pack.references.map((ref, i) => (
                          <div className="ag-doc-ref" key={i}>
                            <p className="ag-doc-referee">
                              {ref.referee}
                              {ref.relationship ? ` — ${ref.relationship}` : ""}
                              {ref.status !== "received" && (
                                <span className="ag-doc-chip">{ref.status === "declined" ? "declined to comment" : "requested, not yet received"}</span>
                              )}
                            </p>
                            {ref.status === "received" &&
                              ref.answers.map((a, j) => (
                                <div className="ag-doc-qa" key={j}>
                                  <p className="ag-doc-q">{a.question}</p>
                                  <p className="ag-doc-a">{a.answer}</p>
                                </div>
                              ))}
                          </div>
                        ))}
                        {pack.references.length === 0 && <p className="ag-doc-empty">No referees were named.</p>}
                      </section>

                      <section className="ag-doc-sec" aria-label="Known gaps">
                        <p className="ag-doc-sec-head"><span className="ag-doc-n">{pack.compliance !== undefined ? "05" : "04"}</span> Known gaps, stated plainly</p>
                        <p className="ag-doc-sec-note">
                          Requirements never evidenced — in the CV, the calls or the interviews. The
                          reader decides what they mean; omitting them would decide it for you.
                        </p>
                        {pack.gaps.length === 0 ? (
                          <p className="ag-doc-empty">Nothing unevidenced.</p>
                        ) : (
                          pack.gaps.map((g, i) => (
                            <p className="ag-doc-gap" key={i}>
                              {g.requirement}
                              <span className="ag-doc-chip">{g.weight}</span>
                            </p>
                          ))
                        )}
                      </section>

                      <footer className="ag-doc-foot">{pack.footer}</footer>
                    </div>

                    <div className="ag-print-hide" style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <button className="ag-btn ag-btn-secondary" onClick={() => window.print()}>
                        Print or save as PDF
                      </button>
                      {!deliveredTo && (
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={generate}
                          disabled={busy}
                          title="Until it is handed over, the pack is a draft — re-freezing pulls in anything completed since (right to work, references, rounds)."
                        >
                          {busy ? "Re-freezing…" : "Re-freeze with the latest record"}
                        </button>
                      )}
                    </div>

                    </>
                    )}

                    {/* Frozen is not finished. The pack exists to be handed
                        over — this is the act that ends Tailr's part, so it
                        lives on the pack rather than in a menu somewhere. */}
                    {!deliveredTo ? (
                      contacts.length > 0 && (
                        <div className="ag-handoff ag-print-hide" role="group" aria-label="Hand the pack over">
                          <div className="ag-handoff-body">
                            <p className="ag-handoff-title">Frozen — now hand it over.</p>
                            <p className="ag-handoff-sub">
                              Delivery is recorded against the contact and audited. From that moment
                              the employer holds the record; Tailr&apos;s part is done.
                            </p>
                          </div>
                          {contacts.length > 1 && (
                            <select
                              className="ag-input"
                              style={{ maxWidth: 220 }}
                              value={deliverTo}
                              onChange={(e) => setDeliverTo(e.target.value)}
                              aria-label="Deliver to"
                            >
                              {contacts.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.full_name} · {c.company}
                                </option>
                              ))}
                            </select>
                          )}
                          <button className="ag-btn ag-btn-primary" onClick={deliver} disabled={busy}>
                            {busy ? "Recording…" : `Hand over to ${contacts.find((c) => c.id === deliverTo)?.company || "the client"}`}
                          </button>
                        </div>
                      )
                    ) : role?.status === "closed" ? (
                      <div className="ag-handoff ag-print-hide" role="status">
                        <div className="ag-handoff-body">
                          <p className="ag-handoff-title">
                            {role.ref} is closed. This desk is done.
                          </p>
                          <p className="ag-handoff-sub">
                            The pack is with the client and stays on record here.
                            {closure
                              ? ` Everyone else was told — ${closure.sent} sent${closure.deferred ? `, ${closure.deferred} still to go` : ""}.`
                              : " Everyone the loop was opened with is told."}
                            {" "}The retention clock is running; when it lapses, Tailr forgets.
                          </p>
                        </div>
                        <button className="ag-btn ag-btn-primary" onClick={() => router.push("/agencies")}>
                          Back to the dashboard
                        </button>
                      </div>
                    ) : (
                      <div className="ag-handoff ag-print-hide" role="status">
                        <div className="ag-handoff-body">
                          <p className="ag-handoff-title">
                            Delivered to {contacts.find((c) => c.id === deliveredTo)?.full_name || "the client"} — one act left.
                          </p>
                          <p className="ag-handoff-sub">
                            Close the role: the retention clock starts on everyone who did not get
                            the job, and they are told the loop is closed. Yours deliberately —
                            nothing closes a role for you.
                          </p>
                        </div>
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={() => chosenId && router.push(`/agencies/candidates/${chosenId}`)}
                          disabled={!chosenId}
                        >
                          Candidate file
                        </button>
                        <button className="ag-btn ag-btn-primary" onClick={closeRole} disabled={busy}>
                          {busy ? "Closing…" : "Close the role"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          <p className="ag-note-quiet" style={{ marginTop: 28 }}>
            When the hire is made, Tailr forgets · handing over starts the retention clock on
            everyone who did not get the job.
          </p>
        </div>
      </main>
    </>
  )
}
