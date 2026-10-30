"use client"

/**
 * One brief, the recruiter's side — frame 25. The body is BriefEditor, which
 * step 01 "Role & brief" renders too (frame 36, 2 Oct 2026): one editor, two
 * entrances, so the two can never drift.
 *
 * Since the Briefs tab was retired (5 Oct 2026) a brief that belongs to ONE
 * role is edited on that role's first step, so an old link to it — an email,
 * a bookmark — goes there. This page stays for a brief with no role (drafts
 * from before frame 36) or one shared by several (before 2 Oct).
 */

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"
import { BriefEditor } from "@/components/agency/brief-editor"

export default function BriefPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = use(params)
  const router = useRouter()
  const [routing, setRouting] = useState(true)
  useEffect(() => {
    let live = true
    fetch(`/api/agency/briefs/${briefId}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { brief?: { connectedRoles?: Array<{ id: string }> } }) : null))
      .then((b) => {
        if (!live) return
        const roles = b?.brief?.connectedRoles ?? []
        if (roles.length === 1) router.replace(`/agencies/roles/${roles[0].id}?step=intake`)
        else setRouting(false)
      })
      .catch(() => live && setRouting(false))
    return () => {
      live = false
    }
  }, [briefId, router])

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
        {routing ? <p className="ag-note">Opening the brief…</p> : <BriefEditor briefId={briefId} />}
      </main>
    </div>
  )
}
