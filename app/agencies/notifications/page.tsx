"use client"

/**
 * Notification preferences — Figma "Recruiter · Notification preferences".
 *
 * Personal, not agency. The owners-only settings screen is about candidate
 * rights; this is about somebody's inbox, and the person who needs to know a
 * brief arrived is the one holding that client — not whoever last opened
 * settings. So an owner sets where everyone starts and never what anyone gets.
 *
 * Three switch states. On and Off are your own choice; the third is "following
 * the agency", drawn dashed, because whose decision it is matters as much as
 * what the decision is. aria-checked always carries the EFFECTIVE value — what
 * will actually happen — and the label beside it says who decided.
 *
 * Every switch starts On. An unheard event is the problem this whole feature
 * exists to solve, so silence is something a person chooses, never something
 * that happens by omission.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"
// Runtime values from the server-import-free module. Importing them from
// lib/agency/notify would drag sendEmail and the service-role key into the
// browser bundle, exactly as settings-limits.ts exists to prevent.
import {
  NOTIFICATION_COPY,
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

export default function NotificationPreferencesPage() {
  const router = useRouter()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [busyKind, setBusyKind] = useState<SwitchableKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/notifications")
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) {
        setError("Could not load your notification settings.")
        return
      }
      const body = await res.json()
      setPrefs(body.prefs as Prefs)
    } catch {
      setError("Could not load your notification settings.")
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  async function set(kind: SwitchableKind, value: PrefValue) {
    setBusyKind(kind)
    setError(null)
    try {
      const res = await fetch("/api/agency/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "personal", kind, value }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not save that.")
        return
      }
      setPrefs(body.prefs as Prefs)
    } catch {
      setError("Could not save that.")
    } finally {
      setBusyKind(null)
    }
  }

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
        <AgencyNav current="notifications" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Yours alone</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Nobody else can change these for you, and changing one never affects a colleague.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <b>Notifications</b>
            </span>
          </div>

          <p className="ag-step-eyebrow">Your notifications · not the agency&apos;s</p>
          <h1 className="ag-title">What reaches you, and what stays in the app</h1>
          <p className="ag-sub">
            Two layers. Your agency sets a default for everyone, and you can override any of them
            for yourself. Anything you have not touched follows the agency and says so. Every
            switch starts on, because an event nobody hears about is the problem this solves.
          </p>

          {error && (
            <p className="ag-banner" role="alert">
              {error}
            </p>
          )}

          {prefs === null ? (
            <p className="ag-quiet" aria-live="polite">Loading…</p>
          ) : (
            <div className="ag-stack" style={{ gap: 18, maxWidth: 760, marginTop: 8 }}>
              <section className="ag-card ag-setting">
                <div className="ag-notif-list">
                  {SWITCHABLE_KINDS.map((kind) => {
                    const copy = NOTIFICATION_COPY[kind]
                    const choice = prefs.mine[kind]
                    const inherited = choice === "agency"
                    const on = prefs.effective[kind]
                    return (
                      <div className="ag-notif-row" key={kind}>
                        <div className="ag-notif-copy">
                          <p className="ag-notif-eyebrow">{copy.eyebrow}</p>
                          <h2 className="ag-notif-title">{copy.title}</h2>
                          <p className="ag-notif-blurb">{copy.blurb}</p>
                          <button
                            className="ag-notif-reset"
                            hidden={inherited}
                            onClick={() => set(kind, "agency")}
                            disabled={busyKind === kind}
                          >
                            Follow the agency again
                          </button>
                        </div>
                        <div className="ag-switch-cell">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${copy.title}. ${
                              inherited
                                ? `Following the agency default, currently ${on ? "on" : "off"}`
                                : on
                                  ? "On"
                                  : "Off"
                            }`}
                            className={`ag-switch${inherited ? " ag-switch-inherited" : ""}`}
                            disabled={busyKind === kind}
                            onClick={() => set(kind, on ? "off" : "on")}
                          />
                          <span
                            className={`ag-switch-label${
                              inherited ? " inherited" : on ? " on" : ""
                            }`}
                          >
                            {inherited ? "Agency" : on ? "On" : "Off"}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p className="ag-notif-note" style={{ marginTop: 22 }}>
                  A dashed switch is the agency&apos;s default, not yours. Your own choice always
                  wins once you make one, and &ldquo;follow the agency again&rdquo; is how you give
                  it back — which is a real state, not the same as switching it off.
                </p>
              </section>

              <section className="ag-card ag-setting">
                <h2 className="ag-setting-title">Not on this list, on purpose</h2>
                <p className="ag-note">
                  Two things this screen deliberately cannot do, because neither is a preference.
                </p>
                <p className="ag-callout ag-book-warn">
                  The email telling a hiring manager you accepted or declined their brief is not
                  here. That is a message to your client, not a notification to you, and it is not
                  yours to switch off. The candidate notice is the same: it has its own cap on the
                  agency settings screen and cannot be disabled at all.
                </p>
                <p className="ag-notif-note">
                  Switching one off silences your inbox, nothing else. The event still happens,
                  still writes its audit row, and still reaches your colleagues. You are choosing
                  not to be told, not choosing that it did not occur.
                </p>
              </section>

              <p className="ag-note-quiet">
                Turning a notification off is written to the audit log against your name, the same
                as any other change. It has to be: &ldquo;nobody told me&rdquo; and &ldquo;I turned
                that off in March&rdquo; are different conversations, and only one of them is
                answerable.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
