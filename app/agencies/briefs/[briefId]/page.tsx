"use client"

/**
 * One brief, the recruiter's side — frame 25, bands A and B.
 *
 * DRAFT: the form (band A) with Send and Save. SENT or later: the one-page
 * review (band B) on top showing what the client sees and whose move it
 * is, with the form underneath for an amendment — which the button names
 * as a new version, because that is what it is.
 */

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AgencyNav } from "@/components/agency/agency-nav"
import { BriefForm, type ContactOption } from "@/components/agency/brief-form"
import { BriefReview } from "@/components/agency/brief-review"
import { diffBrief, type BriefConfig, type BriefState } from "@/lib/agency/brief-options"

interface VersionView {
  version: number
  config: BriefConfig
  authoredBy: "recruiter" | "client"
  changedKeys: string[]
  sentAt: string | null
  recruiterApprovedAt: string | null
  clientApprovedAt: string | null
}
interface BriefView {
  id: string
  agencyName: string
  contactId: string
  contactName: string
  company: string
  title: string
  currentVersion: number
  state: BriefState
  waitingOn: "recruiter" | "client" | null
  latest: VersionView
  previous: VersionView | null
  connectedRoles: Array<{ id: string; ref: string; title: string; version: number }>
  names: Record<string, string>
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null)

export default function BriefPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = use(params)
  const router = useRouter()
  const [brief, setBrief] = useState<BriefView | null>(null)
  const [draft, setDraft] = useState<BriefConfig | null>(null)
  const [title, setTitle] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | "save" | "send" | "approve" | "discard">(null)
  const [contacts, setContacts] = useState<ContactOption[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/briefs/${briefId}`)
      if (!res.ok) return setLoadError(res.status === 404 ? "No such brief on this agency." : "Could not load this brief. Reload the page.")
      const b = ((await res.json()) as { brief: BriefView }).brief
      setBrief(b)
      setDraft(b.latest.config)
      setTitle(b.title)
      setLoadError(null)
      const c = await fetch("/api/agency/contacts")
      if (c.ok) {
        const all = ((await c.json()) as { contacts?: Array<{ id: string; company: string; email: string; full_name: string }> }).contacts ?? []
        setContacts(all.filter((x) => x.company === b.company).map((x) => ({ id: x.id, name: x.full_name || x.email })))
      }
    } catch {
      setLoadError("Could not load this brief. Reload the page.")
    }
  }, [briefId])
  useEffect(() => {
    void load()
  }, [load])

  async function act(kind: "save" | "send" | "approve" | "discard") {
    if (!brief || !draft) return
    if (kind === "send" && !title.trim()) return setError("Give the brief a title first — the client sees it as the search's name.")
    if (kind === "discard" && !window.confirm("Discard this draft? It has not been sent, so nothing is on the record.")) return
    if (kind === "send" && !window.confirm(`Send v${brief.currentVersion} to ${brief.contactName}? Sending signs it for your side; they can approve or change it.`)) return
    setBusy(kind)
    setError(null)
    try {
      // Sending freezes v1. Anything typed since the last save has to be IN
      // v1, so a send is a save first — the E2E found edits dropped and a
      // title the screen showed refused by the server, which read the DB.
      if (kind === "send" && (pending > 0 || title !== brief.title)) {
        const saved = await fetch(`/api/agency/briefs/${briefId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: draft, title }) })
        const sb = await saved.json().catch(() => ({}))
        if (!saved.ok) return setError(typeof sb?.error === "string" ? sb.error : "Could not save before sending. Nothing was sent.")
      }
      let res: Response
      if (kind === "save") {
        res = await fetch(`/api/agency/briefs/${briefId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: draft, title }) })
      } else if (kind === "discard") {
        res = await fetch(`/api/agency/briefs/${briefId}`, { method: "DELETE" })
      } else {
        res = await fetch(`/api/agency/briefs/${briefId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "send" ? { action: "send" } : { action: "approve", version: brief.currentVersion }) })
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(typeof body?.error === "string" ? body.error : "That did not save.")
      if (kind === "discard") return router.push("/agencies/briefs")
      await load()
    } catch {
      setError("That did not save. Nothing has changed.")
    } finally {
      setBusy(null)
    }
  }

  const pending = brief && draft ? diffBrief(brief.latest.config, draft).length : 0
  const isDraft = brief?.state === "draft"

  return (
    <div className="ag-app ag-themed">
      <AgencyNav current="briefs" />
      <main className="ag-main">
        <Link href="/agencies/briefs" className="ag-back">
          ← Briefs
        </Link>
        {loadError && (
          <p className="ag-banner" role="alert">
            {loadError}
          </p>
        )}
        {!brief && !loadError && <p className="ag-note">Loading…</p>}

        {brief && draft && (
          <>
            <div className="ag-screen-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ag-field-label">
                  Brief for {brief.company} · v{brief.currentVersion} ·{" "}
                  {brief.state === "draft" ? "draft, not sent" : brief.state === "approved" ? "approved by both" : brief.waitingOn === "client" ? `waiting on ${brief.contactName}` : "waiting on you"}
                </div>
                {isDraft ? (
                  <input className="ag-input ag-brief-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name the search — e.g. Senior Data Engineer" maxLength={200} aria-label="Brief title" />
                ) : (
                  <h1 className="ag-h1">{brief.title}</h1>
                )}
                <p className="ag-lead">
                  To {brief.contactName} at {brief.company}. {isDraft ? "Nobody but you sees a draft." : `Sent ${fmt(brief.latest.sentAt)}.`}
                </p>
              </div>
            </div>

            {/* Signatures, on one line, in words. */}
            <div className="ag-brief-sigs" role="status">
              <span data-on={Boolean(brief.latest.recruiterApprovedAt) || undefined}>
                {brief.agencyName} — {brief.latest.recruiterApprovedAt ? `approved v${brief.currentVersion} · ${fmt(brief.latest.recruiterApprovedAt)}` : isDraft ? "signs on send" : "not yet"}
              </span>
              <span data-on={Boolean(brief.latest.clientApprovedAt) || undefined}>
                {brief.contactName} — {brief.latest.clientApprovedAt ? `approved v${brief.currentVersion} · ${fmt(brief.latest.clientApprovedAt)}` : "not yet"}
              </span>
            </div>

            {brief.connectedRoles.length > 0 && (
              <p className="ag-note">
                Runs {brief.connectedRoles.map((r) => `${r.ref} (v${r.version})`).join(", ")}.{" "}
                {brief.connectedRoles.some((r) => r.version < brief.currentVersion) && brief.state === "approved" ? "A role is on an older version — it will ask whether to follow." : ""}
              </p>
            )}

            {error && (
              <p className="ag-banner" role="alert">
                {error}
              </p>
            )}

            {!isDraft && (
              <section className="ag-card" style={{ marginBottom: 16 }}>
                <div className="ag-card-head">
                  <span className="ag-card-title">What the client sees · v{brief.currentVersion}</span>
                  {brief.latest.changedKeys.length > 0 && <span className="ag-pill warn">{brief.latest.changedKeys.length} changed by {brief.latest.authoredBy === "client" ? brief.contactName : "you"}</span>}
                </div>
                <div className="ag-card-body">
                  <BriefReview config={brief.latest.config} previous={brief.previous?.config ?? null} changedKeys={brief.latest.changedKeys} names={brief.names} agencyName={brief.agencyName} />
                  {brief.waitingOn === "recruiter" && (
                    <div className="ag-brief-actions">
                      <button className="ag-btn ag-btn-primary" onClick={() => void act("approve")} disabled={!!busy}>
                        {busy === "approve" ? "Approving…" : `Approve v${brief.currentVersion} as ${brief.contactName} changed it`}
                      </button>
                      <span className="ag-note">Or change it below, which sends v{brief.currentVersion + 1} back to them.</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="ag-card">
              <div className="ag-card-head">
                <span className="ag-card-title">{isDraft ? "The brief" : "Amend"}</span>
                <span className="ag-pill">Audit logged</span>
              </div>
              <div className="ag-card-body">
                <BriefForm config={draft} onChange={setDraft} contacts={contacts} disabled={!!busy} />
                <div className="ag-brief-actions">
                  {isDraft ? (
                    <>
                      <button className="ag-btn ag-btn-primary" onClick={() => void act("send")} disabled={!!busy}>
                        {busy === "send" ? "Sending…" : `Send to ${brief.contactName} for approval`}
                      </button>
                      <button className="ag-btn ag-btn-secondary" onClick={() => void act("save")} disabled={!!busy || (pending === 0 && title === brief.title)}>
                        {busy === "save" ? "Saving…" : "Save draft"}
                      </button>
                      <button className="ag-btn ag-btn-secondary" style={{ color: "var(--ag-coral-deep)" }} onClick={() => void act("discard")} disabled={!!busy}>
                        Discard draft
                      </button>
                    </>
                  ) : (
                    <button className="ag-btn ag-btn-primary" onClick={() => void act("save")} disabled={!!busy || pending === 0}>
                      {busy === "save" ? "Sending…" : pending === 0 ? "Nothing changed" : `Send v${brief.currentVersion + 1} to ${brief.contactName} (${pending} change${pending === 1 ? "" : "s"})`}
                    </button>
                  )}
                  <span className="ag-note">
                    {isDraft ? "Sending is v1 and signs it for your side." : "An amendment is a new version, signed by you; their earlier approval was on the old one."}
                  </span>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
