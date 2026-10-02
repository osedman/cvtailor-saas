"use client"

/**
 * One brief, the recruiter's side — the body both entrances render.
 *
 * Frame 25 (bands A and B) on the Briefs screen; frame 36 (approved 2 Oct
 * 2026) on step 01 "Role & brief", where the brief is the role's own and sits
 * beside the job. `embedded` is the step-01 shape: the terms read as a
 * summary with Send / Approve in reach, and the form opens on "Edit the
 * terms". The title follows the role there, so no title box, and no
 * Discard — a role's brief is not thrown away from inside the role.
 *
 * DRAFT: Send and Save. SENT or later: what the client sees, whose move it
 * is, and the form underneath for an amendment — which the button names as
 * a new version, because that is what it is.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BriefForm, type BriefJdView, type ContactOption } from "@/components/agency/brief-form"
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
  jd: BriefJdView | null
}
export interface BriefEditorView {
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

/** The state in a few words, for the step-01 pill and the Briefs header. */
export function briefStateWords(b: Pick<BriefEditorView, "state" | "waitingOn" | "contactName" | "currentVersion" | "latest">): string {
  if (b.state === "draft") return "Draft · not sent"
  if (b.state === "approved") return `Agreed v${b.currentVersion}`
  if (b.waitingOn === "client") return `Waiting on ${b.contactName}`
  return b.latest.authoredBy === "client" ? `Changed by ${b.contactName}` : "Waiting on you"
}

export function BriefEditor({
  briefId,
  embedded = false,
  roleTitle,
  onChanged,
}: {
  briefId: string
  embedded?: boolean
  /** Step 01: the role's title names the search when the brief has none. */
  roleTitle?: string
  /** After any successful write — the role follows its brief, so the page re-reads it. */
  onChanged?: () => void
}) {
  const router = useRouter()
  const [brief, setBrief] = useState<BriefEditorView | null>(null)
  const [draft, setDraft] = useState<BriefConfig | null>(null)
  const [title, setTitle] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | "save" | "send" | "approve" | "discard">(null)
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [editing, setEditing] = useState(!embedded)
  /** A file is being read. Nothing is sent, saved or approved meanwhile, so a
   *  version never leaves without the file being attached to it. */
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/briefs/${briefId}`)
      if (!res.ok) return setLoadError(res.status === 404 ? "No such brief on this agency." : "Could not load this brief. Reload the page.")
      const b = ((await res.json()) as { brief: BriefEditorView }).brief
      setBrief(b)
      setDraft(b.latest.config)
      setTitle(b.title || (embedded ? (roleTitle ?? "").trim() : ""))
      setLoadError(null)
      const c = await fetch("/api/agency/contacts")
      if (c.ok) {
        const all = ((await c.json()) as { contacts?: Array<{ id: string; company: string; email: string; full_name: string }> }).contacts ?? []
        setContacts(all.filter((x) => x.company === b.company).map((x) => ({ id: x.id, name: x.full_name || x.email })))
      }
    } catch {
      setLoadError("Could not load this brief. Reload the page.")
    }
  }, [briefId, embedded, roleTitle])
  useEffect(() => {
    void load()
  }, [load])

  const pending = brief && draft ? diffBrief(brief.latest.config, draft).length : 0
  const isDraft = brief?.state === "draft"

  async function act(kind: "save" | "send" | "approve" | "discard") {
    if (!brief || !draft || uploading) return
    if (kind === "send" && !title.trim()) return setError(embedded ? "Give the role a title first — the client sees it as the search's name." : "Give the brief a title first — the client sees it as the search's name.")
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
      if (embedded) setEditing(false)
      await load()
      onChanged?.()
    } catch {
      setError("That did not save. Nothing has changed.")
    } finally {
      setBusy(null)
    }
  }

  if (loadError) {
    return (
      <p className="ag-banner" role="alert">
        {loadError}
      </p>
    )
  }
  if (!brief || !draft) return <p className="ag-note">Loading…</p>

  const review = (
    <BriefReview
      config={isDraft ? draft : brief.latest.config}
      previous={isDraft ? null : (brief.previous?.config ?? null)}
      changedKeys={isDraft ? [] : brief.latest.changedKeys}
      names={brief.names}
      agencyName={brief.agencyName}
      side="recruiter"
      briefId={briefId}
      jd={brief.latest.jd}
      previousJd={brief.previous?.jd ?? null}
      noJdText={embedded ? "The role's job description, attached when you send" : undefined}
    />
  )

  const approveRow = brief.waitingOn === "recruiter" && (
    <div className="ag-brief-actions">
      <button className="ag-btn ag-btn-primary" onClick={() => void act("approve")} disabled={!!busy || uploading}>
        {busy === "approve" ? "Approving…" : `Approve v${brief.currentVersion} as ${brief.contactName} changed it`}
      </button>
      <span className="ag-note">Or change it, which sends v{brief.currentVersion + 1} back to them.</span>
    </div>
  )

  const form = (
    <>
      <BriefForm
        config={draft}
        onChange={setDraft}
        contacts={contacts}
        disabled={!!busy}
        side="recruiter"
        briefId={briefId}
        jd={brief.latest.jd}
        previousJd={brief.previous?.jd ?? null}
        amending={!isDraft}
        agencyName={brief.agencyName}
        contactName={brief.contactName}
        onError={setError}
        onUploadingChange={setUploading}
        hideJd={embedded}
      />
      <div className="ag-brief-actions">
        {isDraft ? (
          <>
            <button className="ag-btn ag-btn-primary" onClick={() => void act("send")} disabled={!!busy || uploading}>
              {busy === "send" ? "Sending…" : `Send to ${brief.contactName} to agree`}
            </button>
            <button className="ag-btn ag-btn-secondary" onClick={() => void act("save")} disabled={!!busy || uploading || (pending === 0 && title === brief.title)}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            {!embedded && (
              <button className="ag-btn ag-btn-secondary" style={{ color: "var(--ag-coral-deep)" }} onClick={() => void act("discard")} disabled={!!busy || uploading}>
                Discard draft
              </button>
            )}
          </>
        ) : (
          <button className="ag-btn ag-btn-primary" onClick={() => void act("save")} disabled={!!busy || uploading || pending === 0}>
            {busy === "save" ? "Sending…" : pending === 0 ? "Nothing changed" : `Send v${brief.currentVersion + 1} to ${brief.contactName} (${pending} change${pending === 1 ? "" : "s"})`}
          </button>
        )}
        {embedded && (
          <button className="ag-btn" onClick={() => { setDraft(brief.latest.config); setEditing(false) }} disabled={!!busy}>
            Cancel
          </button>
        )}
        <span className="ag-note">
          {isDraft ? "Sending is v1 and signs it for your side." : "An amendment is a new version, signed by you; their earlier approval was on the old one."}
        </span>
      </div>
    </>
  )

  // ── step 01: the role's own brief, beside the job ───────────────────────
  if (embedded) {
    return (
      <div className="ag-stack" style={{ gap: 14 }}>
        <p className="ag-note" style={{ margin: 0 }}>
          What {brief.contactName} agrees to before interviews start. The role runs on these terms now; approval is not a gate.
        </p>
        {error && (
          <p className="ag-banner" role="alert">
            {error}
          </p>
        )}
        {editing ? (
          form
        ) : (
          <>
            {review}
            {approveRow}
            <div className="ag-brief-actions">
              {isDraft && (
                <button className="ag-btn ag-btn-primary" onClick={() => void act("send")} disabled={!!busy || uploading}>
                  {busy === "send" ? "Sending…" : `Send to ${brief.contactName} to agree`}
                </button>
              )}
              <button className="ag-btn ag-btn-secondary" onClick={() => setEditing(true)} disabled={!!busy}>
                Edit the terms
              </button>
              <span className="ag-note">
                {isDraft
                  ? `${brief.contactName} reads it in their workspace. Changes come back as a new version; you see what changed.`
                  : brief.latest.sentAt
                    ? `v${brief.currentVersion} sent ${fmt(brief.latest.sentAt)}.`
                    : ""}
              </span>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── the Briefs screen ───────────────────────────────────────────────────
  return (
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
          Runs{" "}
          {brief.connectedRoles.map((r, i) => (
            <span key={r.id}>
              {i > 0 ? ", " : ""}
              <a className="ag-crumb-link" style={{ textDecoration: "underline" }} href={`/agencies/roles/${r.id}?step=intake`}>
                {r.ref}
              </a>{" "}
              (v{r.version})
            </span>
          ))}
          . A role&rsquo;s brief is edited on its first step, Role &amp; brief.
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
            {review}
            {approveRow}
          </div>
        </section>
      )}

      <section className="ag-card">
        <div className="ag-card-head">
          <span className="ag-card-title">{isDraft ? "The brief" : "Amend"}</span>
          <span className="ag-pill">Audit logged</span>
        </div>
        <div className="ag-card-body">{form}</div>
      </section>
    </>
  )
}
