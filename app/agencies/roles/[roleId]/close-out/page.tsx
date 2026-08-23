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
import { type PhaseKey } from "@/lib/agency/phases"
import type { HandoverSnapshot } from "@/lib/agency/handover"

interface Candidate {
  id: string
  ref: string
  full_name: string
}

interface ReferenceRow {
  id: string
  refereeName: string
  refereeEmail: string
  relationship: string
  status: "drafted" | "requested" | "received" | "chasing" | "declined"
  noticeSentAt: string | null
  receivedAt: string | null
}

const STATUS_TONE: Record<ReferenceRow["status"], string> = {
  // --ag-sage has never existed (the token is --ag-calm), so this silently
  // resolved to the hardcoded fallback every time — and that fallback is a
  // light-ground green.
  received: "var(--ag-calm)",
  requested: "var(--ag-warn)",
  chasing: "var(--ag-warn)",
  drafted: "var(--ag-ink-3)",
  declined: "var(--ag-ink-3)",
}

const STATUS_LABEL: Record<ReferenceRow["status"], string> = {
  received: "Received",
  requested: "Asked",
  chasing: "Chasing",
  drafted: "Not asked yet",
  declined: "Declined",
}

export default function CloseOutPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const router = useRouter()

  const [role, setRole] = useState<{ ref: string; title: string; company: string } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [chosenId, setChosenId] = useState("")
  const [refs, setRefs] = useState<ReferenceRow[] | null>(null)
  const [pack, setPack] = useState<HandoverSnapshot | null>(null)
  const [packId, setPackId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newRef, setNewRef] = useState({ refereeName: "", refereeEmail: "", relationship: "" })
  const [askedLink, setAskedLink] = useState<{ id: string; url: string; emailed: boolean } | null>(null)
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
          setRole({ ref: body.role.ref, title: body.role.title, company: body.role.company ?? "" })
        }
      }
      if (candRes.ok) {
        const body = await candRes.json()
        setCandidates(Array.isArray(body?.candidates) ? body.candidates : [])
      }
    } catch {
      setError("Could not load this role.")
    }
  }, [roleId, router])

  const loadRefs = useCallback(async (candidateId: string) => {
    if (!candidateId) return setRefs(null)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/references`)
      if (!res.ok) return setRefs([])
      const body = await res.json()
      setRefs(Array.isArray(body?.references) ? body.references : [])
    } catch {
      setRefs([])
    }
  }, [])

  useEffect(() => {
    void loadRole()
  }, [loadRole])

  useEffect(() => {
    void loadRefs(chosenId)
  }, [chosenId, loadRefs])

  const chosen = candidates.find((c) => c.id === chosenId) ?? null

  async function addReferee() {
    if (!chosenId || !newRef.refereeName.trim() || !newRef.refereeEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/candidates/${chosenId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRef),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "Could not add that referee.")
        return
      }
      setNewRef({ refereeName: "", refereeEmail: "", relationship: "" })
      await loadRefs(chosenId)
    } finally {
      setBusy(false)
    }
  }

  async function ask(referenceId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/candidates/${chosenId}/references`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not send that request.")
        return
      }
      setAskedLink({ id: referenceId, url: String(body.url ?? ""), emailed: Boolean(body.emailed) })
      await loadRefs(chosenId)
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
          <section className="ag-card" style={{ padding: "18px 22px", marginTop: 8 }}>
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
              <section className="ag-card" style={{ padding: "18px 22px" }} aria-labelledby="refs">
                <div className="ag-card-head" style={{ padding: 0, border: "none" }}>
                  <span className="ag-card-title" id="refs">
                    References
                    {refs ? ` — ${(refs.length - outstanding.length)} of ${refs.length} in` : ""}
                  </span>
                  <span className="ag-grow" />
                  <span className="ag-pill">Audit logged</span>
                </div>

                <div className="ag-stack" style={{ gap: 10, marginTop: 12 }}>
                  {(refs ?? []).map((r) => (
                    <div key={r.id} className="ag-sentlink">
                      <span
                        className="ag-ref-dot"
                        style={{ background: STATUS_TONE[r.status] }}
                        aria-hidden
                      />
                      <span className="ag-grow" style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13 }}>{r.refereeName}</span>
                        <span className="ag-meta" style={{ display: "block" }}>
                          {r.relationship || "Referee"}
                          {r.noticeSentAt ? " · notice sent" : " · no notice yet"}
                        </span>
                      </span>
                      <span className="ag-meta">{STATUS_LABEL[r.status]}</span>
                      {r.status !== "received" && r.status !== "declined" && (
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={() => ask(r.id)}
                          disabled={busy}
                        >
                          {r.status === "drafted" ? "Ask" : "Chase"}
                        </button>
                      )}
                      {askedLink?.id === r.id && !askedLink.emailed && (
                        <p className="ag-note ag-ask-result">
                          We could not email them — send this link yourself:
                          <code className="ag-ask-url">{askedLink.url}</code>
                        </p>
                      )}
                    </div>
                  ))}
                  {refs !== null && refs.length === 0 && (
                    <p className="ag-note">No referees named yet.</p>
                  )}
                </div>

                <div className="ag-stack" style={{ gap: 8, marginTop: 14, borderTop: "1px solid var(--ag-border)", paddingTop: 12 }}>
                  <label className="ag-field-label" htmlFor="ref-name">
                    Referee name
                  </label>
                  <input
                    id="ref-name"
                    className="ag-input"
                    name="refereeName"
                    autoComplete="off"
                    placeholder="Dr Sarah Lindqvist"
                    value={newRef.refereeName}
                    onChange={(e) => setNewRef({ ...newRef, refereeName: e.target.value })}
                  />
                  <label className="ag-field-label" htmlFor="ref-email">
                    Referee email
                  </label>
                  {/* type=email gets the right keyboard and validation;
                      spellcheck off because an address is not prose. */}
                  <input
                    id="ref-email"
                    className="ag-input"
                    type="email"
                    name="refereeEmail"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="s.lindqvist@example.nhs.uk"
                    value={newRef.refereeEmail}
                    onChange={(e) => setNewRef({ ...newRef, refereeEmail: e.target.value })}
                  />
                  <label className="ag-field-label" htmlFor="ref-rel">
                    Relationship
                  </label>
                  <input
                    id="ref-rel"
                    className="ag-input"
                    name="relationship"
                    autoComplete="off"
                    placeholder="Manager, NHS Digital 2022–2025"
                    value={newRef.relationship}
                    onChange={(e) => setNewRef({ ...newRef, relationship: e.target.value })}
                  />
                  <button className="ag-btn ag-btn-secondary" onClick={addReferee} disabled={busy}>
                    Add referee
                  </button>
                </div>

                <p className="ag-note" style={{ marginTop: 12 }}>
                  Referees are data subjects too. The request and their fair-processing notice are
                  the same email — they cannot be asked without being told what you hold — and their
                  words join the pack attributed, never paraphrased.
                </p>
              </section>

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
                    <p className="ag-pack-title">{pack.candidate.name}</p>
                    <p className="ag-meta">
                      {pack.role.title} · {pack.role.company} · prepared by {pack.agency}
                    </p>
                    <hr className="ag-pack-rule" />

                    <PackSection n="01" title="Evidence dossier">
                      {pack.evidence.length} evidenced requirement
                      {pack.evidence.length === 1 ? "" : "s"}, each with its quote and source.
                    </PackSection>
                    <PackSection n="02" title="Interview history">
                      {pack.rounds.length} round{pack.rounds.length === 1 ? "" : "s"}
                      {pack.rounds.some((r) => r.artifact)
                        ? ", each with how it was recorded"
                        : ", none written up yet"}
                      .
                    </PackSection>
                    <PackSection n="03" title="References">
                      {pack.references.filter((r) => r.status === "received").length} received,{" "}
                      {pack.references.filter((r) => r.status !== "received").length} outstanding —
                      listed as outstanding, not omitted.
                    </PackSection>
                    <PackSection n="04" title="Known gaps">
                      {pack.gaps.length === 0
                        ? "Nothing unevidenced."
                        : `${pack.gaps.length} requirement${pack.gaps.length === 1 ? "" : "s"} never evidenced, stated plainly.`}
                    </PackSection>

                    <p className="ag-pack-foot">{pack.footer}</p>
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

function PackSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="ag-pack-sec">
      <span className="ag-pack-n">{n}</span>
      <div>
        <p className="ag-pack-sec-title">{title}</p>
        <p className="ag-note">{children}</p>
      </div>
    </div>
  )
}
