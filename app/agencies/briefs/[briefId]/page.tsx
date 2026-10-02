"use client"

/**
 * One brief, the recruiter's side — frame 25. The body is BriefEditor, which
 * step 01 "Role & brief" renders too (frame 36, 2 Oct 2026): one editor, two
 * entrances, so the two can never drift.
 */

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"
import { BriefEditor } from "@/components/agency/brief-editor"

export default function BriefPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = use(params)
  const router = useRouter()

  return (
    <div className="ag-app ag-themed">
      <aside className="ag-sidebar">
        <button className="ag-brand" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => router.push("/agencies")}>
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <AgencyNav current="briefs" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Signed by both sides</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>Send makes it a version the client can see. Their signature makes it the terms.</div>
        </div>
      </aside>
      <main className="ag-main">
        <Link href="/agencies/briefs" className="ag-back">
          ← Briefs
        </Link>
        <BriefEditor briefId={briefId} />
      </main>
    </div>
  )
}
