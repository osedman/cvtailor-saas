"use client"

/**
 * The brief as one page — Figma frame 25, band B.
 *
 * Both sides render THIS. The recruiter sees it read-only above their form
 * once the brief has been sent; the client sees it as the whole screen.
 * Tier-1 lines get a Change control when `onChange` is supplied (the
 * client); tier-2 lines are read. A line whose key is in `changedKeys` is
 * marked in words — CHANGED — with the previous version's value beside it,
 * not a colour and not an asterisk.
 */

import {
  CLIENT_EDITABLE,
  KEY_LABEL,
  TIER,
  describe,
  type BriefConfig,
} from "@/lib/agency/brief-options"
import { TierPill } from "./brief-form"

/** The lines each tier shows, in reading order. Windows collapse to one line. */
const TIER1_LINES: Array<keyof BriefConfig> = ["rounds", "decisionTurnaroundDays", "disclosure", "feedbackMode"]
const TIER2_LINES: Array<keyof BriefConfig> = ["feePercent", "rebateWeeks", "ownershipMonths", "offerAuthorityContactId", "startTargetMonth", "shortlistSize", "referencesWanted"]

export function windowsLine(c: BriefConfig): string {
  return `${describe("interviewDays", c)} ${c.windowFrom}–${c.windowTo} · ${c.noticeHours}h notice · ${c.bufferMinutes} min buffer · ${c.maxPerDay} a day`
}

export function BriefReview({
  config,
  previous,
  changedKeys,
  names,
  onChange,
  agencyName,
}: {
  config: BriefConfig
  previous: BriefConfig | null
  changedKeys: string[]
  names: Record<string, string>
  /** Supplied by the client's page only. */
  onChange?: (key: keyof BriefConfig) => void
  agencyName: string
}) {
  const changed = new Set(changedKeys)
  const line = (key: keyof BriefConfig, valueOverride?: string, prevOverride?: string) => {
    const isChanged = changed.has(key)
    const value = valueOverride ?? describe(key, config, names)
    const prev = previous ? (prevOverride ?? describe(key, previous, names)) : null
    return (
      <div key={key} className="ag-brief-line" data-changed={isChanged || undefined}>
        <span className="ag-brief-line-k">{KEY_LABEL[key]}</span>
        <span className="ag-brief-line-v">
          {value}
          {isChanged && prev && prev !== value && <span className="ag-brief-line-prev">was: {prev}</span>}
        </span>
        {isChanged && <span className="ag-brief-changed">Changed</span>}
        {onChange && TIER[key] === 1 && CLIENT_EDITABLE.includes(key) && (
          <button type="button" className="ag-btn ag-btn-secondary ag-brief-change" onClick={() => onChange(key)}>
            Change
          </button>
        )}
      </div>
    )
  }
  const windowsChanged = ["interviewDays", "windowFrom", "windowTo", "noticeHours", "bufferMinutes", "maxPerDay"].some((k) => changed.has(k))

  return (
    <div className="ag-brief-review">
      <div className="ag-brief-tier-head">
        <h3>What {onChange ? "you are" : "the client is"} agreeing to</h3>
        <TierPill tier={1} />
      </div>
      <p className="ag-note">{onChange ? "Change any of these and the brief becomes a new version, signed by you, waiting on the agency." : "The four things the client signs for. A change to any of them comes back as a new version."}</p>
      {TIER1_LINES.map((k) => line(k))}
      <div className="ag-brief-line" data-changed={windowsChanged || undefined}>
        <span className="ag-brief-line-k">Interview windows</span>
        <span className="ag-brief-line-v">
          {windowsLine(config)}
          {windowsChanged && previous && <span className="ag-brief-line-prev">was: {windowsLine(previous)}</span>}
        </span>
        {windowsChanged && <span className="ag-brief-changed">Changed</span>}
        {onChange && (
          <button type="button" className="ag-btn ag-btn-secondary ag-brief-change" onClick={() => onChange("interviewDays")}>
            Change
          </button>
        )}
      </div>

      <div className="ag-brief-tier-head">
        <h3>What {agencyName} states</h3>
        <TierPill tier={2} />
      </div>
      <p className="ag-note">{onChange ? "Read these. If one is wrong, say so — that is a change too, and it goes back the same way." : "Stated by the agency; the client reads and acknowledges."}</p>
      {TIER2_LINES.map((k) => line(k))}
      {config.note && (
        <div className="ag-brief-line">
          <span className="ag-brief-line-k">Note</span>
          <span className="ag-brief-line-v">{config.note}</span>
        </div>
      )}
    </div>
  )
}
