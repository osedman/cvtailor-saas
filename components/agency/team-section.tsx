"use client"

/**
 * Settings → Team — Figma frame 22 (signed off 21 Sep 2026).
 *
 * POST /api/agency/team existed from the refinement onward and no screen
 * called it, so adding a recruiter meant SQL. This is that screen.
 *
 * Acts immediately — it is not part of the settings form's Save. Owner-only
 * controls, the same rule the API enforces; everyone else sees the list.
 *
 * THE EMAIL THAT DID NOT GO is the case this exists for. Staging only mails
 * EMAIL_ALLOWLIST, and the API used to answer {added:true} over a refused
 * send. The response now carries what sendEmail actually did, and this says
 * so in words rather than letting "added" imply "told".
 *
 * Suspend, never delete: suspension revokes access at once and keeps the
 * person's audit history. There is no remove button.
 */

import { useCallback, useEffect, useState } from "react"
import { Check, Info, Mail } from "lucide-react"

interface Member {
  user_id: string
  role: "owner" | "recruiter" | "viewer"
  status: "active" | "suspended"
  created_at: string
  signed_in: boolean
  profile: { full_name: string | null; email: string | null } | null
}

type Outcome =
  | { kind: "sent"; who: string; role: string }
  | { kind: "not-sent"; who: string; role: string; staging: boolean }
  | { kind: "already"; who: string; role: string }

const ROLE_LABEL: Record<string, string> = { owner: "Owner", recruiter: "Recruiter", viewer: "Viewer" }

export function TeamSection({ agencyName }: { agencyName: string }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [callerRole, setCallerRole] = useState<string | null>(null)
  const [callerId, setCallerId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"recruiter" | "viewer">("recruiter")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/team")
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setLoadError(typeof body?.error === "string" ? body.error : "Could not load the team.")
      setMembers(Array.isArray(body.members) ? body.members : [])
      setCallerRole(body.caller_role ?? null)
      setCallerId(body.caller_id ?? null)
    } catch {
      setLoadError("Could not load the team.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isOwner = callerRole === "owner"

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const who = email.trim()
    if (!who) return
    setBusy("add")
    setError(null)
    setOutcome(null)
    try {
      const res = await fetch("/api/agency/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: who, role }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not add them. Check the address and try again.")
        return
      }
      const label = ROLE_LABEL[body.role] ?? body.role
      if (body.already) setOutcome({ kind: "already", who, role: label })
      else if (body.email?.sent) setOutcome({ kind: "sent", who, role: label })
      else
        setOutcome({
          kind: "not-sent",
          who,
          role: label,
          staging: typeof body.email?.skipped === "string" && body.email.skipped.includes("allowlist"),
        })
      setEmail("")
      await load()
    } catch {
      setError("Could not add them. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  async function change(userId: string, patch: { role?: string; status?: string }) {
    setBusy(userId)
    setError(null)
    try {
      const res = await fetch("/api/agency/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...patch }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not change that.")
        return
      }
      await load()
    } catch {
      setError("Could not change that. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="ag-card ag-setting" aria-labelledby="team-title">
      <h2 className="ag-setting-title" id="team-title">
        Team
      </h2>
      <p className="ag-note">
        Everyone who can work in {agencyName || "this agency"}. Recruiters work roles and candidates;
        viewers can read but not change anything. Adding someone takes effect straight away.
      </p>

      {loadError ? (
        <p className="ag-banner" role="alert" style={{ marginTop: 12 }}>
          {loadError}
        </p>
      ) : members === null ? (
        <p className="ag-quiet" aria-live="polite" style={{ marginTop: 12 }}>
          Loading…
        </p>
      ) : (
        <ul className="ag-team-list">
          {members.map((m) => {
            const you = m.user_id === callerId
            const name = m.profile?.full_name || m.profile?.email || "Unnamed teammate"
            const meta = [
              m.profile?.email && m.profile.full_name ? m.profile.email : null,
              m.status === "suspended" ? "Suspended" : !m.signed_in ? "Has not signed in yet" : null,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
              <li key={m.user_id} className={`ag-team-row${m.status === "suspended" ? " suspended" : ""}`}>
                <span className="ag-team-who">
                  <span className="ag-team-name">
                    {name}
                    {you && <span className="ag-team-you"> (you)</span>}
                  </span>
                  {meta && <span className="ag-team-meta">{meta}</span>}
                </span>
                {isOwner && !you ? (
                  <span className="ag-team-controls">
                    <label className="ag-sr-only" htmlFor={`role-${m.user_id}`}>
                      Role for {name}
                    </label>
                    <select
                      id={`role-${m.user_id}`}
                      className="ag-input ag-team-select"
                      value={m.role}
                      disabled={busy === m.user_id}
                      onChange={(e) => void change(m.user_id, { role: e.target.value })}
                    >
                      <option value="owner">Owner</option>
                      <option value="recruiter">Recruiter</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="button"
                      className="ag-btn ag-btn-secondary"
                      disabled={busy === m.user_id}
                      onClick={() => void change(m.user_id, { status: m.status === "suspended" ? "active" : "suspended" })}
                    >
                      {m.status === "suspended" ? "Reactivate" : "Suspend"}
                    </button>
                  </span>
                ) : (
                  <span className="ag-team-role">{ROLE_LABEL[m.role] ?? m.role}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {isOwner ? (
        <form className="ag-team-add" onSubmit={add}>
          <h3 className="ag-team-add-title">Add someone</h3>
          <div className="ag-team-form">
            <div className="ag-team-field grow">
              <label htmlFor="team-email">Email</label>
              <input
                id="team-email"
                className="ag-input"
                type="email"
                name="email"
                autoComplete="off"
                spellCheck={false}
                inputMode="email"
                placeholder="name@agency.co.uk…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="ag-team-field">
              <label htmlFor="team-role">Role</label>
              <select
                id="team-role"
                className="ag-input ag-team-select"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "recruiter" | "viewer")}
              >
                <option value="recruiter">Recruiter</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button type="submit" className="ag-btn ag-btn-primary ag-team-submit" disabled={busy === "add"}>
              {busy === "add" ? "Adding…" : "Add to the team"}
            </button>
          </div>
          <p className="ag-note">
            They get an email with a sign-in link. There is no password — they sign in with this address.
          </p>
        </form>
      ) : (
        members !== null && (
          <p className="ag-note" style={{ marginTop: 12 }}>
            Only an owner can add or change teammates.
          </p>
        )
      )}

      <div aria-live="polite">
        {error && (
          <p className="ag-team-outcome warn" role="alert">
            <Info size={18} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        {outcome?.kind === "sent" && (
          <p className="ag-team-outcome ok">
            <Check size={18} aria-hidden="true" />
            <span>
              <b>{outcome.who} is on the team as a {outcome.role.toLowerCase()}.</b> We emailed them a sign-in link.
            </span>
          </p>
        )}
        {outcome?.kind === "not-sent" && (
          <p className="ag-team-outcome warn" role="alert">
            <Mail size={18} aria-hidden="true" />
            <span>
              <b>{outcome.who} is on the team, but we could not email them.</b>{" "}
              {outcome.staging
                ? "Staging only sends email to addresses on EMAIL_ALLOWLIST, and this one is not on it. Add it in Vercel (Preview) and redeploy — until then they cannot receive a sign-in link."
                : "The invite email did not send. They can still sign in at the login page with this address."}
            </span>
          </p>
        )}
        {outcome?.kind === "already" && (
          <p className="ag-team-outcome">
            <Info size={18} aria-hidden="true" />
            <span>
              <b>{outcome.who} is already a {outcome.role.toLowerCase()} here.</b> Nothing changed. Use the role menu
              on their row to change it.
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
