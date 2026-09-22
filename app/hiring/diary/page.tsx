"use client"

/**
 * Diary — when am I interviewing? Figma frame 23, band E (22 Sep 2026).
 *
 * Upcoming interviews across roles, soonest first, and the times you have
 * offered that nobody has booked yet. Nothing that has already happened: a
 * finished interview lives in its role's room, as history.
 */

import Link from "next/link"
import { HmFrame, useHiringData } from "@/components/agency/hm-room"
import { EmptyBand, SlotChip, fmtWhen } from "@/components/agency/hm-shared"
import { roundStarted, stageHref } from "@/lib/agency/hm-room"

export default function DiaryPage() {
  const { screen, rounds, slots, reload, nowMs: now } = useHiringData()
  const upcoming = rounds
    .filter((r) => r.status === "scheduled" && r.scheduled_at && !roundStarted(r, now))
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))
  const offered = slots
    .filter((s) => !s.booked && Date.parse(s.ends_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  return (
    <HmFrame screen={screen} crumb={<><Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> / Diary</>}>
      <section className="agd-hero">
        <h1 className="agd-h1">Diary</h1>
        <p className="agd-sub">
          {upcoming.length === 0
            ? "No interviews booked."
            : upcoming.length === 1
              ? `One interview booked — ${fmtWhen(upcoming[0].scheduled_at as string)}.`
              : `${upcoming.length} interviews booked. The next is ${fmtWhen(upcoming[0].scheduled_at as string)}.`}
        </p>
      </section>

      <section className="agd-band" aria-labelledby="hm-booked">
        <div className="agd-eyebrow-row">
          <h2 className="agd-eyebrow" id="hm-booked">Booked</h2>
          <span className="agd-rule" />
        </div>
        {upcoming.length > 0 ? (
          <ul className="hm-diary">
            {upcoming.map((r) => (
              <li key={r.id}>
                <span className="hm-diary-when">
                  {fmtWhen(r.scheduled_at as string)} · {r.duration_minutes} min
                </span>
                <Link href={stageHref(r.role_id, { key: "round", n: r.round_number })}>
                  Round {r.round_number} · {r.candidate_ref} · {r.role_title}
                </Link>
                {r.meeting_url ? (
                  <a className="hm-diary-join" href={r.meeting_url} target="_blank" rel="noopener noreferrer">
                    Joining link
                  </a>
                ) : (
                  <span className="hm-diary-join" data-none>No joining link yet</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBand
            title="Nothing booked."
            body="When a candidate picks one of your times, it appears here with its joining link."
          />
        )}
      </section>

      <section className="agd-band" aria-labelledby="hm-offered">
        <div className="agd-eyebrow-row">
          <h2 className="agd-eyebrow" id="hm-offered">Times you offered, not yet booked</h2>
          <span className="agd-rule" />
        </div>
        {offered.length > 0 ? (
          <div className="hm-slots">
            {offered.map((slot) => (
              <SlotChip key={slot.id} slot={slot} onWithdraw={() => void reload()} />
            ))}
          </div>
        ) : (
          <p className="ag-note">
            No open times. You offer them from a role — open it and choose <b>Offer times</b>.
          </p>
        )}
      </section>
    </HmFrame>
  )
}
