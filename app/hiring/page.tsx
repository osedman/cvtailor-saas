"use client"

/**
 * To do — the hiring manager's home. Figma frame 23, band B (22 Sep 2026).
 *
 * One question: what do I have to do now? One row per thing owed, across
 * roles, each naming its role and opening the exact step. Below it, quietly,
 * what is coming up — booked interviews and waits on other people, with no
 * button, because nothing there is theirs to press.
 *
 * This replaced "Tasks", which took ONE ladder rung per role: a role where a
 * write-up was owed but another candidate was still being invited read as a
 * wait, and the screen said nothing needed you.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { HmFrame, toSummary, useHiringData } from "@/components/agency/hm-room"
import { fmtWhen } from "@/components/agency/hm-shared"
import { buildTodo, roundStarted, stageHref } from "@/lib/agency/hm-room"

export default function ToDoPage() {
  const data = useHiringData()
  const { screen, roles, rounds, alsoRecruiter, agencyName, nowMs: now } = data

  const roundsTodo = useMemo(() => buildTodo(roles.map(toSummary), rounds, now), [roles, rounds, now])
  /**
   * The brief's door (frame 25, band D). A brief waiting on the client's
   * signature is one more kind of thing OWED, and it goes above the rest:
   * nothing on a role can start until its terms are agreed.
   */
  const [briefs, setBriefs] = useState<Array<{ id: string; title: string; agencyName: string; version: number; state: string; waitingOn: string | null; changedKeys: string[] }>>([])
  useEffect(() => {
    let live = true
    fetch("/api/hiring/briefs")
      .then(async (r) => {
        if (!live || !r.ok) return
        const b = (await r.json()) as { briefs?: typeof briefs }
        setBriefs(Array.isArray(b.briefs) ? b.briefs : [])
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const todo = useMemo(() => {
    const briefRows = briefs
      .filter((b) => b.waitingOn === "client")
      .map((b) => ({
        key: `brief:${b.id}`,
        verb: b.version === 1 || b.changedKeys.length === 0 ? "Approve the brief" : `Review the changed brief (v${b.version})`,
        who: b.title || "the search",
        role: { id: "", ref: `v${b.version}`, title: b.agencyName },
        when: b.changedKeys.length > 0 && b.version > 1 ? `${b.changedKeys.length} line${b.changedKeys.length === 1 ? "" : "s"} changed · your approval cleared` : `${b.agencyName} sent the terms of the search`,
        href: `/hiring/briefs/${b.id}`,
        cta: "Review",
        urgent: true,
      }))
    return [...briefRows, ...roundsTodo]
  }, [briefs, roundsTodo])
  const ownedRoles = new Set(todo.map((t) => t.role.id)).size

  // Coming up: the next booked interviews, then roles waiting on somebody
  // else. Nothing finished — history lives in each role's room.
  const booked = rounds
    .filter((r) => r.status === "scheduled" && r.scheduled_at && !roundStarted(r, now))
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))
    .slice(0, 4)
  const waiting = roles.filter((r) => r.next.mode === "wait" && !todo.some((t) => t.role.id === r.role.id)).slice(0, 4)

  return (
    <HmFrame screen={screen} crumb="Hiring / To do">
      {screen === "ready" && (
        <div className="hm-side-band" role="note">
          <span className="hm-side-dot" aria-hidden="true" />
          <span className="hm-side-text">
            <b>You are on the client side.</b> This is what {agencyName || "your agency"} shows you —
            your interviews and decisions. Their working on candidates is not here.
          </span>
          {alsoRecruiter && (
            <Link className="agd-tbtn hm-side-switch" href="/agencies">
              Back to your agency →
            </Link>
          )}
        </div>
      )}

      <section className="agd-hero">
        <h1 className="agd-h1">
          {todo.length === 0 ? "Nothing needs you." : todo.length === 1 ? "One thing needs you." : `${todo.length} things need you.`}
        </h1>
        <p className="agd-sub">
          {todo.length === 0
            ? booked.length > 0
              ? `Your next interview is ${fmtWhen(booked[0].scheduled_at as string)}.`
              : "When a shortlist arrives or an interview needs writing up, it appears here."
            : `Across ${ownedRoles === 1 ? "one role" : `${ownedRoles} roles`}. Each opens the exact step.`}
        </p>
      </section>

      {todo.length > 0 && (
        <section className="agd-band" aria-labelledby="hm-todo">
          <div className="agd-eyebrow-row">
            <h2 className="agd-eyebrow" id="hm-todo">To do</h2>
            <span className="agd-rule" />
          </div>
          <ul className="hm-todo">
            {todo.map((t) => (
              <li key={t.key} className="hm-todo-row" data-urgent={t.urgent || undefined}>
                <span className="hm-todo-text">
                  <span className="hm-todo-title">
                    {t.verb} · {t.who}
                  </span>
                  <span className="hm-todo-meta">
                    {t.role.title} · {t.role.ref} · {t.when}
                  </span>
                </span>
                <Link className="agd-tbtn primary hm-todo-cta" href={t.href}>
                  {t.cta} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(booked.length > 0 || waiting.length > 0) && (
        <section className="agd-band" aria-labelledby="hm-coming">
          <div className="agd-eyebrow-row">
            <h2 className="agd-eyebrow" id="hm-coming">Coming up · not yours to do yet</h2>
            <span className="agd-rule" />
          </div>
          <ul className="hm-quiet-list">
            {booked.map((r) => (
              <li key={r.id}>
                <Link href={stageHref(r.role_id, { key: "round", n: r.round_number })}>
                  Round {r.round_number} with {r.candidate_ref} · {r.role_title}
                </Link>
                <span>{fmtWhen(r.scheduled_at as string)}</span>
              </li>
            ))}
            {waiting.map((r) => (
              <li key={r.role.id}>
                <Link href={`/hiring/roles/${r.role.id}`}>
                  {r.next.title} · {r.role.title}
                </Link>
                <span>{r.next.waitingOn.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </HmFrame>
  )
}
