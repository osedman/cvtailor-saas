"use client"

/**
 * Chrome and data for the hiring manager's three places — Figma frame 23.
 *
 * One loader for every screen (the ladder rows from /today and the caller's
 * own rounds and windows from /dashboard), one page frame, and the role
 * room's stage bar. Before this, each of seven screens fetched and framed
 * itself, which is how Tasks, My roles and Interviews came to draw the same
 * list three different ways.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import { EmptyBand } from "@/components/agency/hm-shared"
import type { NextAction } from "@/lib/agency/next-action"
import type { HiringRound, HiringSlot } from "@/lib/agency/types"
import {
  currentStage,
  roomStages,
  stageHref,
  stageId,
  stageIndex,
  stageLabel,
  type RoleSummary,
  type RoomStage,
} from "@/lib/agency/hm-room"

export type HmScreen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

export interface TodayRow {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  subState: { key: string; chip: string }
  next: NextAction
}

export function toSummary(r: TodayRow): RoleSummary {
  return { id: r.role.id, ref: r.role.ref, title: r.role.title, subStateKey: r.subState.key, mode: r.next.mode, nextTitle: r.next.title }
}

/** The ladder rows and the caller's own rounds and windows, loaded once. */
export function useHiringData() {
  const [screen, setScreen] = useState<HmScreen>("loading")
  const [roles, setRoles] = useState<TodayRow[]>([])
  const [rounds, setRounds] = useState<HiringRound[]>([])
  const [slots, setSlots] = useState<HiringSlot[]>([])
  const [agencyName, setAgencyName] = useState("")
  const [alsoRecruiter, setAlsoRecruiter] = useState(false)
  // The clock ticks, so an interview can end — and a write-up fall due —
  // while the page is open.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    try {
      const [today, dash] = await Promise.all([fetch("/api/hiring/today"), fetch("/api/hiring/dashboard")])
      if (today.status === 401 || dash.status === 401) return setScreen("unauthed")
      if (today.status === 403 || dash.status === 403) return setScreen("not_linked")
      if (!today.ok || !dash.ok) return setScreen("error")
      const t = (await today.json()) as { roles?: TodayRow[] }
      const body = (await dash.json()) as {
        dashboard?: { rounds?: HiringRound[]; slots?: HiringSlot[]; links?: Array<{ agencyName?: string }> }
        alsoRecruiter?: boolean
      }
      const d = body.dashboard
      if (!d) return setScreen("error")
      setRoles(Array.isArray(t.roles) ? t.roles : [])
      setRounds(Array.isArray(d.rounds) ? d.rounds : [])
      setSlots(Array.isArray(d.slots) ? d.slots : [])
      setAgencyName(d.links?.[0]?.agencyName ?? "")
      setAlsoRecruiter(Boolean(body.alsoRecruiter))
      setScreen("ready")
    } catch {
      setScreen("error")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { screen, roles, rounds, slots, agencyName, alsoRecruiter, nowMs, reload: load }
}

/** One role's room: its ladder row, its rounds, whether a pack reached you. */
export function useRoom(roleId: string) {
  const data = useHiringData()
  const [handover, setHandover] = useState<{ status: "not_yet" | "delivered" | "error" | "loading"; deliveredAt?: string; snapshot?: unknown }>({ status: "loading" })

  useEffect(() => {
    let live = true
    fetch(`/api/hiring/roles/${roleId}/handover`)
      .then(async (r) => {
        if (!live) return
        if (!r.ok) return setHandover({ status: r.status === 404 ? "not_yet" : "error" })
        setHandover(await r.json())
      })
      .catch(() => live && setHandover({ status: "error" }))
    return () => {
      live = false
    }
  }, [roleId])

  const row = data.roles.find((r) => r.role.id === roleId) ?? null
  const rounds = useMemo(() => data.rounds.filter((r) => r.role_id === roleId), [data.rounds, roleId])
  const stages = useMemo(() => roomStages(rounds), [rounds])
  const current = useMemo(
    () => currentStage(rounds, row?.subState.key ?? null, handover.status === "delivered"),
    [rounds, row, handover.status]
  )
  return { ...data, row, rounds, stages, current, handover }
}

/** Topbar and the four honest non-ready states, shared by every screen. */
export function HmFrame({
  screen,
  crumb,
  children,
}: {
  screen: HmScreen
  crumb: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <span className="agd-crumb">{crumb}</span>
        <span className="agd-spacer" />
        {screen === "ready" && (
          <>
            <span className="ag-pill hm-role-chip">Hiring manager</span>
            <SignOut door="consumer" />
          </>
        )}
      </div>
      <div className="agd-page" aria-busy={screen === "loading"}>
        {screen === "loading" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}>
              <span className="ag-spin" />
            </div>
          </div>
        )}
        {screen === "unauthed" && (
          <EmptyBand title="Sign in to see your hiring." body="Your email address and a link we send you — no password." />
        )}
        {screen === "not_linked" && (
          <EmptyBand
            title="This account has no client access yet."
            body="Hiring-manager access is given by invitation only — ask your recruiter for one."
          />
        )}
        {screen === "error" && (
          <EmptyBand title="We could not load this." body="Reload the page. If it keeps failing, tell your recruiter." />
        )}
        {screen === "ready" && children}
      </div>
    </main>
  )
}

/**
 * The room's stage bar. Done stages are links back (history is one click
 * away, never gone); the current stage is marked with words as well as
 * weight; stages not reached yet are shown but not links — a door to a room
 * with nothing in it yet is a broken promise.
 */
export function StageBar({ roleId, stages, current, here }: { roleId: string; stages: RoomStage[]; current: RoomStage; here: RoomStage }) {
  const ci = stageIndex(stages, current)
  return (
    <nav className="hm-stagebar" aria-label="Stages of this role">
      <ol>
        {stages.map((s, i) => {
          const state = i < ci ? "done" : i === ci ? "current" : "next"
          const isHere = stageId(s) === stageId(here)
          const label = (
            <>
              {state === "done" && <span aria-hidden="true">✓ </span>}
              {stageLabel(s)}
              {state === "current" && <span className="ag-sr-only"> (where this role is now)</span>}
            </>
          )
          return (
            <li key={stageId(s)} data-state={state} data-here={isHere || undefined}>
              {state === "next" ? (
                <span className="hm-stage">{label}</span>
              ) : (
                <Link className="hm-stage" href={stageHref(roleId, s)} aria-current={isHere ? "page" : undefined}>
                  {label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Title block + stage bar at the top of every room page. */
export function RoomHeader({
  room,
  roleId,
  here,
}: {
  room: ReturnType<typeof useRoom>
  roleId: string
  here: RoomStage
}) {
  const title = room.row?.role.title || room.rounds[0]?.role_title || "This role"
  return (
    <section className="hm-room-head">
      <Link className="hm-back" href="/hiring/roles">← Roles</Link>
      <h1 className="agd-h1 hm-room-title">{title}</h1>
      <p className="agd-sub">
        {[room.row?.role.ref, room.row?.role.recruiterName ? `with ${room.row.role.recruiterName}` : room.agencyName ? `with ${room.agencyName}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <StageBar roleId={roleId} stages={room.stages} current={room.current} here={here} />
    </section>
  )
}

/** The written-down hand-off at the foot of every stage. Quiet until the
 *  stage is finished, then the primary action. */
export function HandOff({ text, href, label, ready }: { text: string; href: string | null; label: string; ready: boolean }) {
  return (
    <section className="hm-handoff" data-ready={ready || undefined}>
      <p>{text}</p>
      {href ? (
        <Link className={`agd-tbtn${ready ? " primary" : ""}`} href={href}>
          {label} →
        </Link>
      ) : null}
    </section>
  )
}
