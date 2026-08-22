"use client"

/**
 * Agency settings — Figma "Recruiter · Agency settings".
 *
 * Two numbers that have lived in the schema since migration 1 with no way to
 * change them, so every agency has been running on Tailr's opinion rather than
 * their own policy.
 *
 * The copy is the feature. Both settings decide something about people who
 * never signed up to anything — how long their data survives, and how long
 * before they are told it exists — so each field says what it does to a person
 * rather than what it does to a database. The retention note names the reason
 * 180 is the default; the notice note says the cap is not adjustable and that
 * zero is a legitimate, straightforward choice.
 *
 * Owners only, and the screen reads that from the server rather than assuming:
 * a recruiter can run the desk without deciding how long the agency keeps
 * third-party data.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
// Runtime values come from the server-import-free module; the shape is a
// type-only import, which is erased at compile time. Importing the constants
// from lib/agency/settings would drag agencyAdmin — and the service-role key —
// into the browser bundle.
import {
  NOTICE_MAX,
  NOTICE_MIN,
  RETENTION_MAX,
  RETENTION_MIN,
} from "@/lib/agency/settings-limits"
import type { AgencySettings } from "@/lib/agency/settings"
import {
  NOTIFICATION_SHORT,
  SWITCHABLE_KINDS,
  type PrefValue,
  type SwitchableKind,
} from "@/lib/agency/notification-kinds"

type Prefs = {
  mine: Record<SwitchableKind, PrefValue>
  defaults: Record<SwitchableKind, boolean>
  effective: Record<SwitchableKind, boolean>
  canEditDefaults: boolean
}

export default function AgencySettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<AgencySettings | null>(null)
  const [retention, setRetention] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [busyKind, setBusyKind] = useState<SwitchableKind | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/settings")
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) {
        setError("Could not load your settings.")
        return
      }
      const body = await res.json()
      const s = body.settings as AgencySettings
      setSettings(s)
      setRetention(String(s.retentionDays))
      setNotice(String(s.noticeDelayDays))
    } catch {
      setError("Could not load your settings.")
    }
  }, [router])

  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/notifications")
      if (!res.ok) return
      const body = await res.json()
      setPrefs(body.prefs as Prefs)
    } catch {
      // The defaults card simply does not render. It is not worth failing the
      // retention settings over.
    }
  }, [])

  useEffect(() => {
    void load()
    void loadPrefs()
  }, [load, loadPrefs])

  async function setDefault(kind: SwitchableKind, enabled: boolean) {
    setBusyKind(kind)
    setError(null)
    try {
      const res = await fetch("/api/agency/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "agency", kind, enabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not change that default.")
        return
      }
      setPrefs(body.prefs as Prefs)
    } catch {
      setError("Could not change that default.")
    } finally {
      setBusyKind(null)
    }
  }

  const dirty =
    settings !== null &&
    (Number(retention) !== settings.retentionDays || Number(notice) !== settings.noticeDelayDays)

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch("/api/agency/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retentionDays: Number(retention),
          noticeDelayDays: Number(notice),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not save those settings.")
        return
      }
      setSettings(body.settings as AgencySettings)
      setSaved(true)
    } catch {
      setError("Could not save those settings.")
    } finally {
      setBusy(false)
    }
  }

  const readOnly = settings !== null && !settings.canEdit

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
          <button className="ag-step" onClick={() => router.push("/agencies")}>Roles</button>
          <button className="ag-step" onClick={() => router.push("/agencies/clients")}>Client access</button>
          <button className="ag-step" onClick={() => router.push("/agencies/briefs")}>Client briefs</button>
          <button className="ag-step" onClick={() => router.push("/agencies/audit")}>Audit log</button>
          <button className="ag-step on" aria-current="page">Settings</button>
          <button className="ag-step" onClick={() => router.push("/agencies/notifications")}>Notifications</button>
        </div>
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Applies everywhere</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Both settings apply to every role from the moment you change them, not just new ones.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <b>Settings</b>
            </span>
          </div>

          <p className="ag-step-eyebrow">
            Agency settings{settings ? (settings.canEdit ? " · owners only" : " · read only") : ""}
          </p>
          <h1 className="ag-title">How long you keep people, and when you tell them</h1>
          <p className="ag-sub">
            Two numbers with real consequences for people who never signed up to anything, and one
            set of defaults for your own team. All three are audit logged. The numbers apply to
            every role the moment you change them; the defaults only move people who have not
            already chosen for themselves.
          </p>

          {error && (
            <p className="ag-banner" role="alert">
              {error}
            </p>
          )}
          {readOnly && (
            <p className="ag-note" role="status">
              You can see these because you work here, but only an owner can change them.
            </p>
          )}

          {settings === null ? (
            <p className="ag-quiet" aria-live="polite">
              Loading…
            </p>
          ) : (
            <div className="ag-stack" style={{ gap: 18, maxWidth: 760, marginTop: 8 }}>
              <section className="ag-card ag-setting">
                <h2 className="ag-setting-title">Retention</h2>
                <p className="ag-note">
                  How long a candidate&apos;s data is kept after a role closes. When the clock runs
                  out it is deleted automatically — CV, evidence, screening notes, everything except
                  one audit row recording that they were considered.
                </p>
                <div className="ag-setting-row">
                  <label className="ag-sr-only" htmlFor="retention">
                    Retention in days
                  </label>
                  <input
                    id="retention"
                    className="ag-input ag-setting-input"
                    type="number"
                    inputMode="numeric"
                    name="retentionDays"
                    autoComplete="off"
                    min={RETENTION_MIN}
                    max={RETENTION_MAX}
                    value={retention}
                    disabled={readOnly}
                    onChange={(e) => setRetention(e.target.value)}
                  />
                  <span className="ag-note">days after a role closes</span>
                </div>
                <p className="ag-note">
                  180 covers the Equality Act tribunal window with room to spare. Shorter is kinder
                  to candidates; longer needs a reason you could defend.
                </p>
              </section>

              <section className="ag-card ag-setting">
                <h2 className="ag-setting-title">When candidates are told</h2>
                <p className="ag-note">
                  A candidate whose CV you hold has a right to know you hold it. Tailr emails them
                  automatically. This is the grace period before that email goes — time for you to
                  make contact yourself first.
                </p>
                <div className="ag-setting-row">
                  <label className="ag-sr-only" htmlFor="notice">
                    Notice delay in days
                  </label>
                  <input
                    id="notice"
                    className="ag-input ag-setting-input"
                    type="number"
                    inputMode="numeric"
                    name="noticeDelayDays"
                    autoComplete="off"
                    min={NOTICE_MIN}
                    max={NOTICE_MAX}
                    value={notice}
                    disabled={readOnly}
                    onChange={(e) => setNotice(e.target.value)}
                  />
                  <span className="ag-note">
                    days after you add them · maximum {NOTICE_MAX}
                  </span>
                </div>
                <p className="ag-callout ag-book-warn">
                  The cap is {NOTICE_MAX} days and the notice cannot be switched off. Setting it to
                  0 tells them the same day you add them, which is the most straightforward thing
                  you can do.
                </p>
              </section>

              {prefs !== null && (
                <section className="ag-card ag-setting">
                  <h2 className="ag-setting-title">Notification defaults</h2>
                  <p className="ag-note">
                    Where each of the five notifications starts for everyone in the agency. Unlike
                    the two numbers above, this one is a starting point rather than a rule: any
                    recruiter can override it for themselves, and most should be left alone.
                  </p>
                  <div style={{ marginTop: 14 }}>
                    {SWITCHABLE_KINDS.map((kind) => (
                      <div className="ag-default-row" key={kind}>
                        <span className="ag-default-label">{NOTIFICATION_SHORT[kind]}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={prefs.defaults[kind]}
                          aria-label={`${NOTIFICATION_SHORT[kind]} — agency default`}
                          className="ag-switch"
                          disabled={!prefs.canEditDefaults || busyKind === kind}
                          onClick={() => setDefault(kind, !prefs.defaults[kind])}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="ag-notif-note" style={{ marginTop: 14 }}>
                    Changing a default moves it only for people who have not chosen for themselves.
                    It never overwrites somebody&apos;s own setting — an owner sets where everyone
                    starts, not what everyone gets.
                  </p>
                  {!prefs.canEditDefaults && (
                    <p className="ag-note" role="status">
                      Only an owner can change these. Yours are on{" "}
                      <button
                        className="ag-notif-reset"
                        onClick={() => router.push("/agencies/notifications")}
                      >
                        your own notifications page
                      </button>
                      .
                    </p>
                  )}
                </section>
              )}

              {!readOnly && (
                <div className="ag-setting-save">
                  <button className="ag-btn ag-btn-primary" onClick={save} disabled={!dirty || busy}>
                    {busy ? "Saving…" : "Save settings"}
                  </button>
                  <span className="ag-pill">Audit logged</span>
                  {saved && !dirty && (
                    <span className="ag-note" role="status">
                      Saved.
                    </span>
                  )}
                </div>
              )}

              <p className="ag-note-quiet">
                Every change on this page is written to the audit log against your name. Shortening
                retention does not delete anything already past its date until the nightly job
                runs, and changing a default does not touch a recruiter who has already chosen for
                themselves.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
