"use client"

/**
 * The client's brief review — frame 25, band B and the 375px column.
 *
 * The job description and four lines to agree, seven to read, two buttons.
 * Change on a tier-1 line opens that line's control inline; the moment anything differs the primary
 * button re-labels itself "Send v(n+1) back", because you cannot approve a
 * version you have not read. Approving is signing THIS version.
 *
 * Four states that are not "no brief": failed load, superseded, waiting on
 * the agency, connected to a role. Each says so.
 */

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { HmFrame, useHiringData } from "@/components/agency/hm-room"
import { BriefReview } from "@/components/agency/brief-review"
import { BriefForm, type BriefJdView, type ContactOption } from "@/components/agency/brief-form"
import { applyClientAmendment, diffBrief, type BriefConfig, type BriefState } from "@/lib/agency/brief-options"

interface VersionView {
  version: number
  config: BriefConfig
  authoredBy: "recruiter" | "client"
  changedKeys: string[]
  sentAt: string | null
  recruiterApprovedAt: string | null
  clientApprovedAt: string | null
  jd: BriefJdView | null
}
interface BriefView {
  id: string
  agencyName: string
  contactName: string
  company: string
  title: string
  currentVersion: number
  state: BriefState
  waitingOn: "recruiter" | "client" | null
  latest: VersionView
  previous: VersionView | null
  connectedRoles: Array<{ title: string; version: number }>
  names: Record<string, string>
}
type Loaded = { state: "loading" } | { state: "error" } | { state: "none" } | { state: "ready"; brief: BriefView }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null)

export default function ClientBriefPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = use(params)
  const { screen } = useHiringData()
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" })
  const [draft, setDraft] = useState<BriefConfig | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<null | "approve" | "send">(null)
  const [error, setError] = useState<string | null>(null)
  /** Files the client attached in this visit. The form unmounts when they go
   *  back to the summary, and the summary still has to name the new file. */
  const [uploads, setUploads] = useState<BriefJdView[]>([])
  /** A file is being read. Nothing is sent, approved or undone meanwhile. */
  const [uploading, setUploading] = useState(false)
  const locked = !!busy || uploading

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hiring/briefs/${briefId}`)
      if (res.status === 404) return setLoaded({ state: "none" })
      if (!res.ok) return setLoaded({ state: "error" })
      const brief = ((await res.json()) as { brief: BriefView }).brief
      setLoaded({ state: "ready", brief })
      setDraft(brief.latest.config)
      setEditing(false)
    } catch {
      setLoaded({ state: "error" })
    }
  }, [briefId])
  useEffect(() => {
    void load()
  }, [load])

  const brief = loaded.state === "ready" ? loaded.brief : null
  // brief.names carries the job description's file ids too (so describe()
  // reads a file name); a file is not a person to put in a round.
  const fileIds = new Set([brief?.latest.jd?.fileId, brief?.previous?.jd?.fileId].filter(Boolean))
  const contacts: ContactOption[] = brief ? Object.entries(brief.names).filter(([id]) => !fileIds.has(id)).map(([id, name]) => ({ id, name })) : []
  const changes = brief && draft ? applyClientAmendment(brief.latest.config, draft).changes : []
  const dirty = changes.length > 0
  const knownFiles = brief ? [...uploads, brief.latest.jd, brief.previous?.jd ?? null] : []
  const draftJd = draft?.jdFileId ? (knownFiles.find((f) => f?.fileId === draft.jdFileId) ?? null) : null

  async function approve() {
    if (!brief || uploading) return
    if (!window.confirm(`Approve v${brief.currentVersion}? This signs it for ${brief.company}. ${brief.latest.recruiterApprovedAt ? "Both sides will then have agreed, and roles can run on it." : `${brief.agencyName} still has to sign.`}`)) return
    setBusy("approve")
    setError(null)
    try {
      const res = await fetch(`/api/hiring/briefs/${briefId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", version: brief.currentVersion }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(typeof body?.error === "string" ? body.error : "Could not approve. Nothing has changed.")
      await load()
    } catch {
      setError("Could not approve. Nothing has changed.")
    } finally {
      setBusy(null)
    }
  }

  async function sendBack() {
    if (!brief || !draft || !dirty || uploading) return
    if (!window.confirm(`Send v${brief.currentVersion + 1} back to ${brief.agencyName} with ${changes.length} change${changes.length === 1 ? "" : "s"}? Your signature goes on it; theirs is cleared until they approve it.`)) return
    setBusy("send")
    setError(null)
    try {
      const res = await fetch(`/api/hiring/briefs/${briefId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: draft }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(typeof body?.error === "string" ? body.error : "Could not send that back. Nothing has changed.")
      await load()
    } catch {
      setError("Could not send that back. Nothing has changed.")
    } finally {
      setBusy(null)
    }
  }

  const heading = brief ? `How we will run the ${brief.title} search` : "The brief"

  return (
    <HmFrame screen={screen} crumb={<><Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> / Brief</>}>
      {loaded.state === "loading" && (
        <p className="ag-quiet" role="status">
          Loading the brief…
        </p>
      )}
      {loaded.state === "error" && (
        <p className="ag-banner" role="alert">
          We could not load the brief. Reload, or ask your recruiter to resend — nothing you did is lost.
        </p>
      )}
      {loaded.state === "none" && (
        <section className="agd-band">
          <div className="hm-note-card">
            <p className="hm-note-title">No brief was sent to you at this address.</p>
            <p>If your recruiter mentioned one, it may be addressed to a colleague, or not sent yet.</p>
          </div>
        </section>
      )}

      {brief && draft && (
        <>
          <section className="agd-hero">
            <p className="agd-eyebrow">
              Brief · v{brief.currentVersion} · {brief.latest.authoredBy === "client" ? "your version" : `sent by ${brief.agencyName}`} · {fmt(brief.latest.sentAt)}
            </p>
            <h1 className="agd-h1">{heading}</h1>
            <div className="hm-brief-sigs" role="status">
              <span data-on={Boolean(brief.latest.recruiterApprovedAt) || undefined}>
                {brief.agencyName} — {brief.latest.recruiterApprovedAt ? `approved v${brief.currentVersion} · ${fmt(brief.latest.recruiterApprovedAt)}` : "cleared by your change"}
              </span>
              <span data-on={Boolean(brief.latest.clientApprovedAt) || undefined}>
                You ({brief.company}) — {brief.latest.clientApprovedAt ? `approved v${brief.currentVersion} · ${fmt(brief.latest.clientApprovedAt)}` : dirty ? "will sign on send" : "not yet"}
              </span>
            </div>
            {brief.state === "approved" && (
              <p className="agd-sub">
                Both sides have signed v{brief.currentVersion}.{" "}
                {brief.connectedRoles.length > 0 ? `It runs ${brief.connectedRoles.map((r) => r.title).join(", ")}.` : "Roles can run on it now."}{" "}
                Changing it now would make v{brief.currentVersion + 1}, and any role on it will be asked whether to follow.
              </p>
            )}
            {brief.state === "amended" && !dirty && <p className="agd-sub">You sent v{brief.currentVersion} on {fmt(brief.latest.sentAt)}. Nothing to do until {brief.agencyName} signs or changes it.</p>}
          </section>

          {error && (
            <p className="ag-banner" role="alert">
              {error}
            </p>
          )}

          <section className="agd-band">
            {!editing ? (
              <BriefReview
                config={draft}
                previous={dirty ? brief.latest.config : (brief.previous?.config ?? null)}
                changedKeys={dirty ? changes.map((c) => c.key) : brief.latest.changedKeys}
                names={brief.names}
                agencyName={brief.agencyName}
                onChange={brief.state === "approved" ? undefined : () => setEditing(true)}
                side="client"
                briefId={briefId}
                jd={draftJd}
                previousJd={dirty ? brief.latest.jd : (brief.previous?.jd ?? null)}
              />
            ) : (
              <>
                <p className="agd-aside">Only the job description and the four numbered sections after it are yours to change; the rest are {brief.agencyName}&apos;s terms, shown for the record.</p>
                <BriefForm
                  config={draft}
                  onChange={setDraft}
                  contacts={contacts}
                  disabled={!!busy}
                  side="client"
                  briefId={briefId}
                  jd={brief.latest.jd}
                  previousJd={brief.previous?.jd ?? null}
                  amending
                  agencyName={brief.agencyName}
                  contactName={brief.contactName}
                  onError={setError}
                  uploads={uploads}
                  onUploaded={(f) => setUploads((u) => [f, ...u])}
                  onUploadingChange={setUploading}
                />
                <button className="agd-tbtn" onClick={() => setEditing(false)} disabled={uploading}>
                  Back to the summary
                </button>
              </>
            )}

            {brief.state !== "approved" && (
              <div className="hm-brief-actions">
                {dirty ? (
                  <button className="agd-tbtn primary" onClick={() => void sendBack()} disabled={locked}>
                    {busy === "send" ? "Sending…" : `Send v${brief.currentVersion + 1} back to ${brief.agencyName}`}
                  </button>
                ) : brief.waitingOn === "client" ? (
                  <button className="agd-tbtn primary" onClick={() => void approve()} disabled={locked}>
                    {busy === "approve" ? "Approving…" : `Approve v${brief.currentVersion}`}
                  </button>
                ) : null}
                {dirty && (
                  <button
                    className="agd-tbtn"
                    onClick={() => {
                      setDraft(brief.latest.config)
                      setEditing(false)
                    }}
                    disabled={locked}
                  >
                    Undo my changes
                  </button>
                )}
                <p className="agd-aside">
                  {dirty
                    ? `${changes.length} change${changes.length === 1 ? "" : "s"}. Sending signs the new version for you and clears ${brief.agencyName}'s approval until they read it.`
                    : brief.waitingOn === "client"
                      ? "Approving signs this version. Nothing is sent to candidates by this."
                      : ""}
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </HmFrame>
  )
}
