"use client"

/**
 * Candidate detail as a PLACE, for a link, a refresh or a colleague: its own
 * sidebar and the workflow rail. Inside the flow the same URL opens as a
 * pop-up (the intercepting modal beside this). It is no longer a step in the
 * rail (Ose, 1 Oct 2026), so no rail entry is marked current here. The
 * evidence itself lives in CandidateDetail, which both entrances render.
 */

import { use } from "react"
import { useRouter } from "next/navigation"
import { WORKFLOW_STEPS, stepNumber } from "@/lib/agency/steps"
import { workflowHref } from "@/lib/agency/phases"
import { SignOut } from "@/components/agency/sign-out"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { CandidateDetail } from "@/components/agency/candidate-detail"

export default function CandidateDetailPage({
  params,
}: {
  params: Promise<{ roleId: string; candidateId: string }>
}) {
  const { roleId, candidateId } = use(params)
  const router = useRouter()

  return (
    <>
      <aside className="ag-sidebar">
        <button className="ag-brand" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => router.push("/agencies")}>
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <AgencyNav inRole />
        {/* A named group, not more global nav: see .ag-rail-group. */}
        <div className="ag-rail-group">
          <div className="ag-rail-label">Shortlist workflow</div>
          {WORKFLOW_STEPS.map((st) => (
            <button key={st.key} className="ag-step" onClick={() => router.push(workflowHref(roleId, st.key))}>
              {/* No ticks here. This rail once hard-coded a ✓ on every step
                  but this one, so it claimed progress the role may not have
                  made (found 11 Sep 2026). The workflow page knows what is
                  actually done; this page does not, so it says nothing. */}
              <span className="ag-step-num">{stepNumber(st.key)}</span>{" "}
              {st.label}
            </button>
          ))}
        </div>
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-eyebrow" style={{ marginBottom: 6 }}>Decision support only</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            No candidate is ever auto-rejected. All shortlists are subject to recruiter judgment.
          </div>
        </div>
      </aside>
      <main className="ag-main">
        <CandidateDetail roleId={roleId} candidateId={candidateId} />
      </main>
    </>
  )
}
