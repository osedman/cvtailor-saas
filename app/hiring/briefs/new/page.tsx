"use client"

/**
 * Write a brief — step 1 of the interview loop, from the client's side.
 *
 * Built to the signed-off frame "HM · Write a brief" (Figma: Tailr — Hiring
 * Manager Concept, page 01). Every field maps 1:1 onto an agency.role_briefs
 * column, so nothing on screen lacks a home in the schema.
 *
 * The copy carries three product rules at the point of use rather than in a
 * policy page, and they are not decoration:
 *   - the subhead says every line becomes a requirement they screen against,
 *     because that is the difference between this and a job ad;
 *   - the nice-to-haves hint says they never rule anyone out, which is the
 *     no-auto-rejection rule stated where someone is about to type;
 *   - "What this form is not" says the role is never posted publicly and the
 *     company is not named to candidates by default (AGENCIES_SCHEMA.md §5).
 * If any of those lines go, the screen stops telling the truth about itself.
 *
 * Dark surface: this is the workspace, so it renders .agd-main like the
 * dashboard and inherits the dark theme scoped by `.ag-app:has(.agd-main)`.
 */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { HiringLink } from "@/lib/agency/types"
import { HiringNav } from "@/components/agency/hm-shared"
import "../../hiring.css"

type Screen = "loading" | "signed-out" | "not-linked" | "ready"

import { MAX_FIELD, MAX_JD, MAX_TITLE } from "@/lib/agency/brief-limits"

interface Draft {
  roleTitle: string
  jdRaw: string
  interviewRounds: number | null
  startTarget: string
  team: string
  mission: string
  mustHaves: string
  niceToHaves: string
  comp: string
  location: string
}

const EMPTY: Draft = {
  roleTitle: "",
  jdRaw: "",
  interviewRounds: null,
  startTarget: "",
  team: "",
  mission: "",
  mustHaves: "",
  niceToHaves: "",
  comp: "",
  location: "",
}

// Imported, never redeclared: these caps used to be a local copy that had
// drifted from the server's, which silently cut a pasted JD at 4,000
// characters. See lib/agency/brief-limits.ts.

export default function NewBriefPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>("loading")
  const [links, setLinks] = useState<HiringLink[]>([])
  const [contactId, setContactId] = useState("")
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [jdBusy, setJdBusy] = useState(false)
  const [jdNote, setJdNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/hiring/me")
        if (cancelled) return
        if (res.status === 401) return setScreen("signed-out")
        if (res.status === 403) return setScreen("not-linked")
        if (!res.ok) return setScreen("not-linked")
        const body = (await res.json()) as { links?: HiringLink[] }
        const found = body.links ?? []
        setLinks(found)
        setContactId(found[0]?.contactId ?? "")
        setScreen(found.length > 0 ? "ready" : "not-linked")
      } catch {
        if (!cancelled) setScreen("not-linked")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const link = useMemo(
    () => links.find((l) => l.contactId === contactId) ?? links[0] ?? null,
    [links, contactId]
  )
  const agency = link?.agencyName || "your recruiter"
  const canSend = draft.roleTitle.trim().length > 0 && !saving && !!link

  /** The JD is a document, not a form field, and is capped like one — the
   * server stores 30,000. Applying the 4,000 field cap here is what was
   * quietly truncating pasted job descriptions before they were ever sent. */
  function capFor(key: keyof Draft): number {
    if (key === "roleTitle") return MAX_TITLE
    if (key === "jdRaw") return MAX_JD
    return MAX_FIELD
  }

  function field(key: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [key]: value.slice(0, capFor(key)) }))
  }

  async function uploadJd(file: File) {
    setJdBusy(true)
    setJdNote(null)
    setError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/hiring/briefs/extract", { method: "POST", body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setJdNote(typeof data?.error === "string" ? data.error : "Could not read that file.")
        return
      }
      // Fills the box rather than submitting: what gets sent is always
      // something the hiring manager has had a chance to see and correct.
      field("jdRaw", String(data.text ?? ""))
      setJdNote(
        data.truncated
          ? `Read ${file.name}, and kept the first ${Number(data.characters).toLocaleString()} characters. Check the end of the box.`
          : `Read ${file.name}. Edit it below if anything came through oddly.`
      )
    } catch {
      setJdNote("Could not read that file.")
    } finally {
      setJdBusy(false)
    }
  }

  async function send() {
    if (!link || !canSend) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/hiring/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: link.contactId, ...draft }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || "That did not send. Nothing was lost — try again.")
        setSaving(false)
        return
      }
      router.push("/hiring?sent=1")
    } catch {
      setError("That did not send. Nothing was lost — try again.")
      setSaving(false)
    }
  }

  if (screen === "loading") {
    return (
      <main className="agd-main hm-main">
        <p className="agd-aside" style={{ padding: "40px 30px" }} aria-live="polite">
          Loading…
        </p>
      </main>
    )
  }

  if (screen !== "ready") {
    return (
      <main className="agd-main hm-main">
        <div className="agd-page">
          <div className="agd-band">
            <h1 className="agd-h1">
              {screen === "signed-out" ? "Sign in to write a brief." : "You do not have client access yet."}
            </h1>
            <p className="agd-sub">
              {screen === "signed-out"
                ? "Same login as the rest of Tailr: your email address and a link we send you."
                : "Ask your recruiter for an invite — it takes them a couple of seconds, and the link lands in your inbox."}
            </p>
            {screen === "signed-out" && (
              <p style={{ marginTop: 18 }}>
                <Link className="agd-tbtn primary" href="/agencies/sign-in?next=/hiring/briefs/new">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="agd-main hm-main">
      <HiringNav />
      <div className="agd-page">
        <header className="agd-hero">
          <p className="agd-date">New brief</p>
          <h1 className="agd-h1">What are you hiring for?</h1>
          <p className="agd-sub">
            This goes to your recruiter at <b>{agency}</b>, not to a job board. Nothing here is a
            form to satisfy: every line becomes a requirement they screen against, and you will see
            the scores trace back to it.
          </p>
        </header>

        <div className="hm-brief-grid">
          <section className="agd-card hm-static hm-brief-form" aria-label="Brief details">
            {links.length > 1 && (
              <Field label="Who is this for" htmlFor="brief-contact">
                <select
                  id="brief-contact"
                  className="ag-input"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                >
                  {links.map((l) => (
                    <option key={l.contactId} value={l.contactId}>
                      {l.agencyName} — {l.company}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Role title" htmlFor="brief-title" required>
              <input
                id="brief-title"
                className="ag-input"
                value={draft.roleTitle}
                onChange={(e) => field("roleTitle", e.target.value)}
                placeholder="Senior Data Engineer"
                maxLength={MAX_TITLE}
                autoFocus
              />
            </Field>

            <Field label="Team" htmlFor="brief-team" optional>
              <input
                id="brief-team"
                className="ag-input"
                value={draft.team}
                onChange={(e) => field("team", e.target.value)}
                placeholder="Data Platform — 6 engineers, reports to Head of Engineering"
              />
            </Field>

            <Field
              label="Job description"
              htmlFor="brief-jd"
              optional
              hint="Paste the JD if you have one — your recruiter parses the requirements straight from it, so you never retype what a document already says. The fields below add what the JD leaves out."
            >
              <textarea
                id="brief-jd"
                className="ag-textarea"
                rows={7}
                value={draft.jdRaw}
                onChange={(e) => field("jdRaw", e.target.value)}
                placeholder="Paste the full job description here…"
              />
              <div className="ag-jd-upload">
                <label className="ag-btn ag-btn-secondary" htmlFor="brief-jd-file">
                  {jdBusy ? "Reading…" : "Upload a file"}
                </label>
                <input
                  id="brief-jd-file"
                  className="ag-sr-only"
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,text/plain"
                  disabled={jdBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    // Reset first, so choosing the same file twice still fires.
                    e.target.value = ""
                    if (f) void uploadJd(f)
                  }}
                />
                <span className="ag-note">
                  PDF, DOCX or TXT · up to 10 MB — it fills the box above, which you can then edit.
                </span>
              </div>
              {jdNote && (
                <p className="ag-note" role="status">
                  {jdNote}
                </p>
              )}
            </Field>

            <Field
              label="What this role owns"
              htmlFor="brief-mission"
              optional
              hint="One or two sentences. This is the line candidates actually respond to."
            >
              <textarea
                id="brief-mission"
                className="ag-textarea"
                rows={3}
                value={draft.mission}
                onChange={(e) => field("mission", e.target.value)}
                placeholder="Own the streaming layer that moves clinical events between trusts. Reliability is the product."
              />
            </Field>

            <Field
              label="Must-haves"
              htmlFor="brief-must"
              hint="One per line. These carry the most weight when your shortlist is scored."
            >
              <textarea
                id="brief-must"
                className="ag-textarea"
                rows={3}
                value={draft.mustHaves}
                onChange={(e) => field("mustHaves", e.target.value)}
                placeholder={"Kafka at production scale\nPython\nOn-call ownership"}
              />
            </Field>

            <Field
              label="Nice-to-haves"
              htmlFor="brief-nice"
              optional
              hint="One per line. Scored, but they never rule anyone out."
            >
              <textarea
                id="brief-nice"
                className="ag-textarea"
                rows={2}
                value={draft.niceToHaves}
                onChange={(e) => field("niceToHaves", e.target.value)}
                placeholder={"dbt · Terraform\nPrior healthcare domain"}
              />
            </Field>

            <Field
              label="How many interview rounds do you expect?"
              htmlFor="brief-rounds"
              optional
              hint="Your plan, not a contract — rounds are booked one at a time, and the number on record follows what actually happens."
            >
              <div role="radiogroup" aria-label="Expected interview rounds" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={draft.interviewRounds === n}
                    className="ag-btn ag-btn-secondary"
                    style={
                      draft.interviewRounds === n
                        ? { background: "var(--ag-ink)", color: "var(--ag-paper)", borderColor: "var(--ag-ink)" }
                        : undefined
                    }
                    onClick={() =>
                      setDraft((d) => ({ ...d, interviewRounds: d.interviewRounds === n ? null : n }))
                    }
                  >
                    {n === 4 ? "4+" : n}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="When do you want someone in seat?"
              htmlFor="brief-start"
              optional
              hint="In your words — a month, a quarter, or just how urgent it is."
            >
              <input
                id="brief-start"
                className="ag-input"
                value={draft.startTarget}
                onChange={(e) => field("startTarget", e.target.value)}
                placeholder="October — the current contractor leaves end of September"
              />
            </Field>

            <div className="hm-brief-pair">
              <Field label="Compensation" htmlFor="brief-comp" optional>
                <input
                  id="brief-comp"
                  className="ag-input"
                  value={draft.comp}
                  onChange={(e) => field("comp", e.target.value)}
                  placeholder="£85–95k"
                />
              </Field>
              <Field label="Location" htmlFor="brief-location" optional>
                <input
                  id="brief-location"
                  className="ag-input"
                  value={draft.location}
                  onChange={(e) => field("location", e.target.value)}
                  placeholder="Hybrid — 2 days Leeds"
                />
              </Field>
            </div>

            {error && (
              <p className="ag-banner" role="alert">
                {error}
              </p>
            )}

            <div className="hm-brief-actions">
              <button className="agd-tbtn primary" onClick={send} disabled={!canSend}>
                {saving ? "Sending…" : `Send to ${agency}`}
              </button>
              <Link className="agd-tbtn" href="/hiring">
                Cancel
              </Link>
              <span className="agd-aside">You can edit a brief until your recruiter picks it up.</span>
            </div>
          </section>

          <aside className="hm-brief-rail">
            <section className="agd-card hm-static">
              <p className="agd-eyebrow">What happens next</p>
              <ol className="hm-steps-list">
                <li>
                  <b>{agency} reads it and turns it into a role.</b> They weight the must-haves with
                  you — nothing is scored from this form alone.
                </li>
                <li>
                  <b>The role appears on your workspace.</b> With its reference, so you can both talk
                  about a number rather than “the data one”.
                </li>
                <li>
                  <b>They come back with a shortlist.</b> Evidence attached to every name.
                </li>
              </ol>
            </section>

            <section className="agd-card hm-static">
              <p className="agd-eyebrow">What this form is not</p>
              <ul className="hm-not-list">
                <li>It is not posted anywhere. No job board, no listing, no candidates see it.</li>
                <li>Nobody is screened or scored from this page.</li>
                <li>Your recruiter can decline a brief, and you will see why.</li>
                <li>
                  Tailr never posts your role publicly, and your company name is not shown to
                  candidates unless your recruiter chooses to name it.
                </li>
              </ul>
            </section>
          </aside>
        </div>

        <p className="agd-aside hm-foot">
          Drafts are yours · your recruiter sees a brief only when you send it · every change is
          audit logged
        </p>
      </div>
    </main>
  )
}

function Field({
  label,
  htmlFor,
  required,
  optional,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  optional?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="hm-field">
      <label className="ag-field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="hm-req"> *</span>}
        {optional && <span className="hm-opt"> (optional)</span>}
      </label>
      {children}
      {hint && <p className="hm-field-hint">{hint}</p>}
    </div>
  )
}
