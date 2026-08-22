"use client"

/**
 * Client access — the recruiter side of the hiring-manager hat.
 *
 * This screen is the only place an agency grants a client-side person a way
 * into Tailr. The model it has to make legible in one read:
 *
 *   - Access is invite-only. A contact in your address book has no access at
 *     all until you send them one, and accepting it requires proving they own
 *     the mailbox the invite was addressed to. There is no self-claim.
 *   - Access is narrow. It lets them post briefs and run interview rounds
 *     with you. It never opens your candidate pool, your screening notes or
 *     your scores.
 *   - Access is reversible, and every grant, revocation and removal is
 *     written to the agency audit log against the recruiter who did it.
 *
 * Every write here is audit-coupled server side, which is why the actions
 * carry the AUDIT LOGGED pill and why the destructive ones ask first — the
 * same breath the "Reset call" control takes on the shortlist workflow.
 *
 * Nothing on this page is mocked. Contacts come from the agency's own
 * address book; where there are none, the empty state says so and points at
 * the step that creates them rather than inventing a row to look busy.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
// Type-only import: erased at compile time, so the server-side client-auth
// module (next/headers, service-role keys, node crypto) never reaches the
// browser bundle. The shape is the contract; the runtime is the API route.
import type { ClientAccessRow, ClientAccessState } from "@/lib/agency/client-auth"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"

/** What each access state is called, and how it reads. */
const STATE_PILL: Record<ClientAccessState, { label: string; style: CSSProperties }> = {
  // A live grant: coral, the same weight the product gives anything active.
  linked: { label: "Linked", style: { color: "var(--ag-coral-deep)", borderColor: "var(--ag-tint-2)", background: "var(--ag-tint-1)" } },
  // Sent, not yet accepted. Neutral — nothing has happened yet.
  invited: { label: "Invited", style: {} },
  // Amber: it needs an action from you, but nothing is wrong.
  expired: { label: "Expired", style: { color: "var(--ag-warn)" } },
  // The resting state, and deliberately the quietest thing on the row.
  none: { label: "No access", style: { color: "var(--ag-ink-3)", borderStyle: "dashed" } },
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

function initials(row: ClientAccessRow): string {
  const source = row.fullName || row.company || "?"
  return source.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
}

function readString(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = body[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  return null
}

/**
 * The freshly minted invite, read out of what POST .../invite actually answers:
 *
 *   { invite: { id, expiresAt, url }, emailed: boolean }
 *
 * The fields live inside that envelope, so read through it. Getting this level
 * wrong fails silently and expensively — no link panel (and the raw token is
 * unrecoverable the moment the response is dropped), no expiry on the row, and
 * a null inviteId that turns the next "Revoke invite" into a 400. The flat
 * fallback means a future reshape degrades to one missing field instead.
 *
 * The accept URL is what a recruiter can actually paste to a person; a bare
 * token is only shown if that is all we are given, because guessing at a path
 * would hand over a link that goes nowhere.
 */
function readIssuedInvite(body: Record<string, unknown>): {
  id: string | null
  expiresAt: string | null
  issued: { value: string; isLink: boolean } | null
} {
  const inner = body.invite
  const src = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : body
  const url = readString(src, "url", "link", "invite_url", "inviteUrl")
  const token = readString(src, "rawToken", "raw_token", "token")

  return {
    id: readString(src, "id", "inviteId", "invite_id"),
    expiresAt: readString(src, "expiresAt", "expires_at"),
    issued: url ? { value: url, isLink: true } : token ? { value: token, isLink: false } : null,
  }
}

export default function ClientAccessPage() {
  const router = useRouter()
  // null while loading — an empty array is a real answer, not a spinner.
  const [rows, setRows] = useState<ClientAccessRow[] | null>(null)
  // Adding a client lived ONLY inside a role's submission step, so a new
  // agency could not add its first client without opening a role. Found in
  // Ose's walk-through, 22 Aug.
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ company: "", email: "", full_name: "" })
  const [addBusy, setAddBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyContact, setBusyContact] = useState<string | null>(null)
  const [issued, setIssued] = useState<{
    contactId: string
    company: string
    value: string
    isLink: boolean
    expiresAt: string | null
    // null when the route did not say either way — then the copy claims nothing.
    emailed: boolean | null
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/agency/clients")
    if (res.status === 401) return router.push("/agencies")
    if (!res.ok) {
      setRows([])
      setError(res.status === 403 ? "You are not a member of an agency." : "Could not load your client contacts.")
      return
    }
    const body = await res.json()
    setRows(Array.isArray(body?.clients) ? body.clients : Array.isArray(body) ? body : [])
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  async function addContact() {
    const company = draft.company.trim()
    const email = draft.email.trim()
    if (!company || !email) {
      return setError("A client needs a company and an email address.")
    }
    setAddBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/agency/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, email, full_name: draft.full_name.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return setError(typeof body?.error === "string" ? body.error : "Could not add that client.")
      }
      setDraft({ company: "", email: "", full_name: "" })
      setAdding(false)
      // Adding does NOT grant access — the new row appears with no invite,
      // and inviting stays a separate, deliberate act with its own audit row.
      await load()
    } catch {
      setError("Could not add that client.")
    } finally {
      setAddBusy(false)
    }
  }

  function patchRow(contactId: string, patch: Partial<ClientAccessRow>) {
    setRows((prev) => (prev ? prev.map((r) => (r.contactId === contactId ? { ...r, ...patch } : r)) : prev))
  }

  /**
   * Optimistic write, with the row restored if it did not land.
   *
   * Same shape as the screening controls on the shortlist workflow (7 Aug): the
   * pill moves first so the click reads as having done something, and the
   * server is the reconciler. A failure puts the row back exactly as it was —
   * an access pill that says LINKED when the grant never happened is the one
   * lie this screen cannot afford.
   */
  async function mutate(
    row: ClientAccessRow,
    optimistic: Partial<ClientAccessRow>,
    request: () => Promise<Response>,
    failMessage: string
  ): Promise<Record<string, unknown> | null> {
    const rollback = row
    patchRow(row.contactId, optimistic)
    setBusyContact(row.contactId)
    try {
      const res = await request()
      const body: Record<string, unknown> = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Server messages below 500 are written for the recruiter ("invite
        // already accepted — unlink the contact to remove access"). A 500 is
        // a fault, and its text is for the logs, not this page.
        const detail = res.status < 500 ? readString(body, "error") : null
        throw new Error(res.status === 403 ? detail ?? "You have view-only access to this agency." : detail ?? failMessage)
      }
      setError(null)
      return body
    } catch (e) {
      setRows((prev) => (prev ? prev.map((r) => (r.contactId === rollback.contactId ? rollback : r)) : prev))
      setError(e instanceof Error ? e.message : failMessage)
      return null
    } finally {
      setBusyContact(null)
    }
  }

  async function sendInvite(row: ClientAccessRow, resend: boolean) {
    if (
      resend &&
      !window.confirm(
        `Send ${row.company} a new invite? The link already in their inbox stops working the moment this one is issued. Both the replacement and the revocation are written to the audit log.`
      )
    ) {
      return
    }
    setIssued(null)
    setCopied(false)
    const body = await mutate(
      row,
      // Expiry is the server's to set, so it stays blank until the response
      // says otherwise rather than showing a date we guessed.
      { state: "invited", inviteId: null, expiresAt: null },
      () => fetch(`/api/agency/clients/${row.contactId}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      "That invite did not send."
    )
    if (!body) return

    const { id, expiresAt, issued: value } = readIssuedInvite(body)
    patchRow(row.contactId, { state: "invited", inviteId: id, expiresAt })
    if (value) {
      setIssued({
        contactId: row.contactId,
        company: row.company,
        ...value,
        expiresAt,
        // The invite is valid whether or not the mail went out, so the route
        // answers 201 either way and reports delivery separately. The panel has
        // to say which happened: telling a recruiter it was emailed when it
        // bounced is how a client never hears from them and nobody finds out.
        emailed: typeof body.emailed === "boolean" ? body.emailed : null,
      })
    }
    // Missing the link (nothing to show) or the id (the next revoke would 400):
    // re-read rather than sit on a row we half-guessed.
    if (!value || !id) await load()
  }

  async function revokeInvite(row: ClientAccessRow) {
    if (
      !window.confirm(
        `Revoke the invite for ${row.company}? The link in their inbox stops working immediately. The revocation is written to the audit log, and you can invite them again whenever you want.`
      )
    ) {
      return
    }
    const body = await mutate(
      row,
      { state: "none", inviteId: null, expiresAt: null },
      () =>
        fetch(`/api/agency/clients/${row.contactId}/invite`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          // The route may resolve the live invite from the contact on its own;
          // sending the id costs nothing and removes the ambiguity.
          body: JSON.stringify({ inviteId: row.inviteId }),
        }),
      "That invite was not revoked."
    )
    if (body && issued?.contactId === row.contactId) setIssued(null)
  }

  async function removeAccess(row: ClientAccessRow) {
    if (
      !window.confirm(
        `Remove ${row.company}'s access? They stop being able to sign in and post briefs or see interview rounds with you. Everything they have already sent you stays, the removal is written to the audit log, and you can invite them again later.`
      )
    ) {
      return
    }
    const body = await mutate(
      row,
      { state: "none", inviteId: null, expiresAt: null },
      () => fetch(`/api/agency/clients/${row.contactId}/link`, { method: "DELETE" }),
      "That access was not removed."
    )
    if (body && issued?.contactId === row.contactId) setIssued(null)
  }

  function copyIssued() {
    if (!issued) return
    navigator.clipboard?.writeText(issued.value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const linked = rows?.filter((r) => r.state === "linked").length ?? 0
  const invited = rows?.filter((r) => r.state === "invited").length ?? 0

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
        <AgencyNav current="clients" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Invite only</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Nobody gains access by signing up. A client contact is only ever linked by an invite you sent them.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Dashboard</button>
              {" / "}
              <b>Client access</b>
            </span>
            <span className="ag-grow" />
            <button className="ag-btn ag-btn-secondary" onClick={() => router.push("/agencies")}>← Dashboard</button>
          </div>
          <p className="ag-step-eyebrow">Client access</p>

          {error && (
            <div className="ag-banner" role="alert" style={{ marginBottom: 16 }}>
              <div className="ag-grow" style={{ fontSize: 12.5, color: "var(--ag-coral-deep)" }}>{error}</div>
              <button className="ag-btn" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          <div className="ag-screen-head">
            <div>
              <h1 className="ag-title">Let the client in.<br />Only as far as you meant to.</h1>
              <p className="ag-sub">
                Giving a client contact access lets them post briefs and run interview rounds with you inside Tailr — it does
                not give them your candidate pool, your notes, or anything you have not deliberately sent them.
              </p>
            </div>
            {!adding && (
              <button className="ag-btn ag-btn-primary" onClick={() => setAdding(true)}>
                Add a client
              </button>
            )}
          </div>

          {adding && (
            <div className="ag-card ag-add-client" style={{ marginBottom: 20 }}>
              <div className="ag-card-head">
                <span className="ag-card-title">Add a client</span>
                <span className="ag-meta">Adding them does not give them access</span>
              </div>
              <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                <div className="ag-add-client-grid">
                  <label className="ag-field">
                    <span className="ag-field-label">Company</span>
                    <input
                      className="ag-input"
                      value={draft.company}
                      autoFocus
                      onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
                      placeholder="Meridian Health"
                    />
                  </label>
                  <label className="ag-field">
                    <span className="ag-field-label">Their email</span>
                    <input
                      className="ag-input"
                      type="email"
                      value={draft.email}
                      onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                      placeholder="name@company.com"
                    />
                  </label>
                  <label className="ag-field">
                    <span className="ag-field-label">Their name (optional)</span>
                    <input
                      className="ag-input"
                      value={draft.full_name}
                      onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                      placeholder="Marcus Webb"
                    />
                  </label>
                </div>
                <p className="ag-note">
                  This adds them to your address book. They get nothing until you send an invite,
                  which is the next step on their row — and that is the act the audit log records as
                  granting access.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="ag-btn ag-btn-primary" onClick={addContact} disabled={addBusy}>
                    {addBusy ? "Adding…" : "Add client"}
                  </button>
                  <button
                    className="ag-btn ag-btn-secondary"
                    disabled={addBusy}
                    onClick={() => { setAdding(false); setDraft({ company: "", email: "", full_name: "" }) }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {issued && (
            <div className="ag-card" style={{ marginBottom: 20, borderColor: "var(--ag-coral)" }}>
              <div className="ag-card-head">
                <span className="ag-card-title">Invite for {issued.company}</span>
                <span className="ag-pill" style={{ color: "var(--ag-coral-deep)", borderColor: "var(--ag-tint-2)", background: "var(--ag-tint-1)" }}>Shown once</span>
              </div>
              <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                <p className="ag-note">
                  This is the only time Tailr will show you this {issued.isLink ? "link" : "token"} — it is stored hashed, so
                  nobody, including us, can read it back. If it goes astray, send a new invite: issuing one revokes the last.
                </p>
                {issued.emailed === false && (
                  <p className="ag-note" style={{ color: "var(--ag-coral-deep)" }}>
                    The invite is valid, but Tailr could not email it to them. This is the only copy — you will need to send
                    it to them yourself.
                  </p>
                )}
                {issued.emailed === true && (
                  <p className="ag-note">It has also been emailed to the contact, so you do not have to pass it on.</p>
                )}
                <div className="ag-link-row" style={{ marginBottom: 0 }}>
                  <span className="ag-meta">{issued.isLink ? "LINK" : "TOKEN"}</span>
                  <code className="ag-link-url">{issued.value}</code>
                  <button className="ag-btn ag-btn-secondary" onClick={copyIssued}>{copied ? "Copied" : "Copy"}</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span className="ag-meta">
                    {shortDate(issued.expiresAt) ? `Expires ${shortDate(issued.expiresAt)}` : "Expires after the invite window"}
                  </span>
                  <span className="ag-grow" />
                  <button className="ag-btn" onClick={() => setIssued(null)}>Hide</button>
                </div>
                <p className="ag-note">
                  Accepting it requires signing in as the address it was sent to. A forwarded link cannot be claimed by
                  anyone else.
                </p>
              </div>
            </div>
          )}

          {rows === null && (
            <div className="ag-card"><div className="ag-card-body"><span className="ag-spin" /></div></div>
          )}

          {rows !== null && rows.length === 0 && (
            <div className="ag-card">
              <div className="ag-card-head">
                <span className="ag-card-title">Client contacts</span>
                <span className="ag-pill">None yet</span>
              </div>
              <div className="ag-card-body">
                <div className="ag-quiet" style={{ maxWidth: "56ch", margin: "0 auto" }}>
                  <p style={{ margin: "0 0 10px" }}>You have no client contacts yet, so there is nobody to give access to.</p>
                  <p className="ag-note" style={{ marginBottom: 16 }}>
                    Contacts are created on the <b>Submission</b> step of a role, when you name the person a shortlist is
                    going to. Everyone you have sent to shows up here, whether or not you ever invite them in.
                  </p>
                  <button className="ag-btn ag-btn-primary" onClick={() => router.push("/agencies")}>Go to your roles</button>
                </div>
              </div>
            </div>
          )}

          {rows !== null && rows.length > 0 && (
            <div className="ag-card">
              <div className="ag-card-head">
                <span className="ag-card-title">Client contacts</span>
                <span className="ag-grow" />
                <span className="ag-meta">
                  {rows.length} contact{rows.length === 1 ? "" : "s"} · {linked} with access · {invited} invited
                </span>
                <span
                  className="ag-pill"
                  title="Every invite, revocation and removal on this screen is written to the agency audit log against your name."
                >
                  Audit logged
                </span>
              </div>

              {rows.map((row) => {
                const pill = STATE_PILL[row.state] ?? STATE_PILL.none
                const expiry = shortDate(row.expiresAt)
                const busy = busyContact === row.contactId
                return (
                  <div
                    key={row.contactId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 14,
                      flexWrap: "wrap",
                      padding: "14px 18px",
                      borderTop: "1px solid var(--ag-border)",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <div className="ag-avatar">{initials(row)}</div>
                    <div className="ag-grow" style={{ minWidth: 180 }}>
                      <div style={{ fontSize: "var(--t-lead)", fontWeight: 600 }}>{row.company}</div>
                      {row.fullName && <div style={{ fontSize: "var(--t-small)", color: "var(--ag-ink-2)" }}>{row.fullName}</div>}
                      <div className="ag-meta" style={{ overflowWrap: "anywhere" }}>{row.email}</div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", minWidth: 120 }}>
                      <span className="ag-pill" style={pill.style}>{pill.label}</span>
                      {row.state === "invited" && (
                        <span className="ag-meta">{expiry ? `Expires ${expiry}` : "Awaiting acceptance"}</span>
                      )}
                      {row.state === "expired" && (
                        <span className="ag-meta">{expiry ? `Expired ${expiry}` : "Invite ran out"}</span>
                      )}
                      {row.state === "linked" && <span className="ag-meta">Signs in as this address</span>}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {(row.state === "none" || row.state === "expired") && (
                        <button className="ag-btn ag-btn-secondary" disabled={busy} onClick={() => sendInvite(row, false)}>
                          {row.state === "expired" ? "Invite again" : "Invite"}
                        </button>
                      )}
                      {row.state === "invited" && (
                        <>
                          <button className="ag-btn ag-btn-secondary" disabled={busy} onClick={() => sendInvite(row, true)}>
                            Resend
                          </button>
                          <button
                            className="ag-btn ag-btn-secondary"
                            style={{ color: "var(--ag-coral-deep)" }}
                            disabled={busy}
                            onClick={() => revokeInvite(row)}
                          >
                            Revoke invite
                          </button>
                        </>
                      )}
                      {row.state === "linked" && (
                        <button
                          className="ag-btn ag-btn-secondary"
                          style={{ color: "var(--ag-coral-deep)" }}
                          disabled={busy}
                          onClick={() => removeAccess(row)}
                        >
                          Remove access
                        </button>
                      )}
                      {busy && <span className="ag-spin" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="ag-card" style={{ marginTop: 20 }}>
            <div className="ag-card-head">
              <span className="ag-card-title">What a linked contact can and cannot see</span>
            </div>
            <div className="ag-card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
              <div>
                <div className="ag-field-label">They can</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--t-small)", color: "var(--ag-ink-2)", lineHeight: 1.65 }}>
                  <li>Post a brief for a role they want you to fill</li>
                  <li>Share the times they are free to interview</li>
                  <li>See the interview rounds you have arranged with them</li>
                  <li>Record their decision after a round</li>
                </ul>
              </div>
              <div>
                <div className="ag-field-label">They cannot</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--t-small)", color: "var(--ag-ink-2)", lineHeight: 1.65 }}>
                  <li>Open your candidate pool, or any candidate you have not submitted to them</li>
                  <li>Read your screening notes, call answers or recruiter-only fields</li>
                  <li>See your scoring, your overrides or your other clients</li>
                  <li>Invite anyone else, or change their own access</li>
                </ul>
              </div>
            </div>
            <div className="ag-card-body" style={{ borderTop: "1px solid var(--ag-border)" }}>
              <p className="ag-note" style={{ marginBottom: 8 }}>
                Their side of Tailr shows only what has actually been created. Until a brief, an availability slot or an
                interview round exists, they see an empty screen — not a preview of one.
              </p>
              <p className="ag-note">
                Removing access unlinks the person from the contact and kills any invite still sitting in an inbox. It does
                not delete the contact, the briefs they sent you, or the audit trail.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
