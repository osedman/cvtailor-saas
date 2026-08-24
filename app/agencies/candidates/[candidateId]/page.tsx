"use client"

/**
 * The candidate file — the operational record, OUTSIDE the shortlist workflow.
 *
 * The seven steps score a candidate; this screen runs them as a person moving
 * through interviews and handover: right-to-work and logistics, references,
 * the placement record. Every fact completed here flows into the handover
 * pack, which is why the file exists — before it, RTW lived only on the
 * workflow's step 06, so finishing compliance meant re-entering a flow whose
 * work was already done (Ose, 24 Aug 2026).
 *
 * Scoring and the evidence map deliberately stay in the workflow. This file
 * is the paperwork; step 06 is the judgement. The two link to each other and
 * never merge.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { SignOut } from "@/components/agency/sign-out"
import { CandidateCompliance } from "@/components/agency/candidate-compliance"
import { CandidatePlacement } from "@/components/agency/candidate-placement"
import { CandidateReferences } from "@/components/agency/candidate-references"
import { PhaseRail } from "@/components/agency/phase-rail"
import { type PhaseKey } from "@/lib/agency/phases"

interface FileCandidate {
  id: string
  ref: string
  fullName: string
  currentTitle: string
  source: string
  ingestedAt: string | null
  redacted: boolean
}

interface FileRole {
  id: string
  ref: string
  title: string
  company: string
}

export default function CandidateFilePage({
  params,
}: {
  params: Promise<{ candidateId: string }>
}) {
  const { candidateId } = use(params)
  const router = useRouter()
  const [candidate, setCandidate] = useState<FileCandidate | null>(null)
  const [role, setRole] = useState<FileRole | null>(null)
  const [phase, setPhase] = useState<PhaseKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** What the pack will carry, as facts: recorded or not yet. Deliberately
   *  never a percentage or a progress bar — that would score a person; this
   *  describes paperwork. null until read. */
  const [ready, setReady] = useState<{
    rtw: boolean
    refsIn: number
    refsTotal: number
    placement: boolean
  } | null>(null)

  const loadReadiness = useCallback(async () => {
    try {
      const [comp, refs, plc] = await Promise.all([
        fetch(`/api/agency/candidates/${candidateId}/compliance`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/agency/candidates/${candidateId}/references`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/agency/candidates/${candidateId}/placement`).then((r) => (r.ok ? r.json() : null)),
      ])
      const rows = Array.isArray(refs?.references) ? refs.references : []
      setReady({
        rtw:
          comp?.compliance?.rtwEvidence === "seen" ||
          (comp?.compliance?.rtwSponsorship && comp.compliance.rtwSponsorship !== "not_asked"),
        refsIn: rows.filter((r: { status: string }) => r.status === "received").length,
        refsTotal: rows.length,
        placement: Boolean(plc?.placement),
      })
    } catch {
      setReady(null)
    }
  }, [candidateId])

  useEffect(() => {
    void loadReadiness()
  }, [loadReadiness])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}`)
      if (res.status === 401) return router.push("/agencies")
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not load this candidate.")
        return
      }
      setCandidate(body.candidate ?? null)
      setRole(body.role ?? null)
      setPhase((body.phase as PhaseKey | null) ?? null)
    } catch {
      setError("Could not load this candidate.")
    }
  }, [candidateId, router])

  useEffect(() => {
    void load()
  }, [load])

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
          {role && (
            <>
              <button className="ag-step" onClick={() => router.push(`/agencies/roles/${role.id}/interviews`)}>
                Interviews
              </button>
              <button className="ag-step" onClick={() => router.push(`/agencies/roles/${role.id}/close-out`)}>
                Close-out
              </button>
            </>
          )}
          <button className="ag-step on" aria-current="page">Candidate file</button>
        </div>
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>What this screen is</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            The paperwork that travels with the person — right to work, references, the placement.
            Everything recorded here joins the handover pack. Scoring stays in the workflow.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Dashboard</button>
              {" / "}
              <button className="ag-crumb-link" onClick={() => router.push("/agencies/candidates")}>
                Candidates
              </button>
              {" / "}
              <b>{candidate?.ref || "Candidate"}</b>
            </span>
            <span className="ag-grow" />
            {role && <PhaseRail current={phase} roleId={role.id} />}
          </div>

          <div className="ag-file-tab" role="group" aria-label="Candidate file">
            <div className="ag-file-tab-lip">
              <span className="ag-file-tab-label">Candidate file</span>
              {candidate && <span className="ag-file-tab-ref">{candidate.ref}</span>}
            </div>
            <div className="ag-file-tab-body">
          <h1 className="ag-title" style={{ marginTop: 0 }}>{candidate ? candidate.fullName : "Loading…"}</h1>
          {candidate && (
            <p className="ag-sub">
              {candidate.currentTitle || "No current title on file"}
              {role ? (
                <>
                  {" · on "}
                  <button
                    className="ag-crumb-link"
                    style={{ font: "inherit", textDecoration: "underline" }}
                    onClick={() => router.push(`/agencies/roles/${role.id}`)}
                  >
                    {role.ref} — {role.title}
                  </button>
                  {role.company ? ` at ${role.company}` : ""}
                </>
              ) : null}
            </p>
          )}

          {ready && candidate && !candidate.redacted && (
            <div className="ag-file-ready" aria-label="What the pack will carry">
              <span className="ag-file-ready-label">Travels into the pack</span>
              <span className={`ag-file-ready-item ${ready.rtw ? "done" : ""}`}>
                <span className="ag-file-ready-dot" aria-hidden />
                Right to work · {ready.rtw ? "recorded" : "not yet"}
              </span>
              <span className={`ag-file-ready-item ${ready.refsTotal > 0 && ready.refsIn === ready.refsTotal ? "done" : ""}`}>
                <span className="ag-file-ready-dot" aria-hidden />
                References · {ready.refsTotal === 0 ? "none named" : `${ready.refsIn} of ${ready.refsTotal} in`}
              </span>
              <span className={`ag-file-ready-item ${ready.placement ? "done" : ""}`}>
                <span className="ag-file-ready-dot" aria-hidden />
                Placement · {ready.placement ? "recorded" : "not yet"}
              </span>
            </div>
          )}
            </div>
          </div>

          {error && <p className="ag-banner" role="alert">{error}</p>}

          {candidate && !candidate.redacted && (
            <div className="ag-close-grid">
              <div className="ag-stack" style={{ gap: 20 }}>
                <CandidateCompliance candidateId={candidateId} onSaved={loadReadiness} />
                <CandidatePlacement candidateId={candidateId} onSaved={loadReadiness} />
              </div>
              <div className="ag-stack" style={{ gap: 20 }}>
                <CandidateReferences candidateId={candidateId} onRefsChange={() => loadReadiness()} />
                <section className="ag-card" style={{ padding: "18px 22px" }}>
                  <div className="ag-card-head" style={{ padding: 0, border: "none" }}>
                    <span className="ag-card-title">Evidence &amp; scoring</span>
                  </div>
                  <p className="ag-note" style={{ marginTop: 10 }}>
                    The evidence map, screening answers and score live in the shortlist workflow —
                    the judgement side of this person&apos;s record.
                  </p>
                  {role && (
                    <button
                      className="ag-btn ag-btn-secondary"
                      style={{ marginTop: 10 }}
                      onClick={() => router.push(`/agencies/roles/${role.id}/candidates/${candidateId}`)}
                    >
                      Open the evidence map →
                    </button>
                  )}
                </section>
              </div>
            </div>
          )}

          {candidate?.redacted && (
            <p className="ag-note" style={{ marginTop: 16 }}>
              This person asked to be erased. The file holds nothing.
            </p>
          )}

          <p className="ag-note-quiet" style={{ marginTop: 28 }}>
            Right to work, references and the placement all travel into the handover pack — complete
            them here and the pack carries them.
          </p>
        </div>
      </main>
    </>
  )
}
