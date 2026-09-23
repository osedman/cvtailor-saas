"use client"

/**
 * The recruiter's brief form — Figma frame 25, band A v2 ("nothing typed").
 *
 * Every field is a select, a stepper or a set of chips over an option set
 * from lib/agency/brief-options.ts. People come from the client's linked
 * contacts and are stored as contact ids, so the round's decider is the same
 * person the room, the diary and the audit already know. The one free-text
 * field is an optional note.
 *
 * Two tiers, one pill: CLIENT AGREES on rounds, deciding, what is shown and
 * feedback; CLIENT ACKNOWLEDGES on the rest. The client's page renders the
 * same pill on the same sections, so both sides read one document.
 *
 * A draft saves in place. Once sent, saving makes a NEW version (the module
 * decides; the form just says which will happen on the button).
 */

import { useMemo } from "react"
import {
  BUFFER_MIN,
  DURATIONS_MIN,
  FEEDBACK_DAYS,
  FEEDBACK_MODES,
  FEEDBACK_MODE_LABEL,
  FEE_BASES,
  FEE_BASIS_LABEL,
  INVOICE_POINTS,
  INVOICE_POINT_LABEL,
  MAX_PER_DAY,
  MAX_ROUNDS,
  NOTICE_HOURS,
  OWNERSHIP_MONTHS,
  REBATE_SHAPES,
  REBATE_SHAPE_LABEL,
  REBATE_WEEKS,
  ROUND_FORMATS,
  ROUND_FORMAT_LABEL,
  ROUND_PURPOSES,
  ROUND_PURPOSE_LABEL,
  SHORTLIST_SIZE,
  TIME_STEPS,
  TURNAROUND_DAYS,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type BriefConfig,
  type BriefRound,
  type Weekday,
} from "@/lib/agency/brief-options"

export interface ContactOption {
  id: string
  name: string
}

export function TierPill({ tier }: { tier: 1 | 2 }) {
  return (
    <span className={`ag-brief-tier ag-brief-tier-${tier}`}>{tier === 1 ? "Client agrees" : "Client acknowledges"}</span>
  )
}

function Section({ n, title, tier, sub, children }: { n: number; title: string; tier: 1 | 2; sub?: string; children: React.ReactNode }) {
  return (
    <section className="ag-brief-section" aria-labelledby={`brief-s${n}`}>
      <div className="ag-brief-section-head">
        <h3 id={`brief-s${n}`} className="ag-brief-section-title">
          {n} · {title}
        </h3>
        <TierPill tier={tier} />
      </div>
      {sub && <p className="ag-note">{sub}</p>}
      {children}
    </section>
  )
}

function Select<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
  render,
}: {
  id: string
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  hint?: string
  render?: (v: T) => string
}) {
  const isNumber = typeof value === "number"
  return (
    <div className="ag-brief-field">
      <label className="ag-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="ag-input" value={String(value)} onChange={(e) => onChange((isNumber ? Number(e.target.value) : e.target.value) as T)}>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {render ? render(o) : String(o)}
          </option>
        ))}
      </select>
      {hint && <p className="ag-brief-hint">{hint}</p>}
    </div>
  )
}

function Stepper({ id, label, value, min, max, step = 1, unit, onChange, hint, format }: { id: string; label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; hint?: string; format?: (v: number) => string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const shown = format ? format(value) : `${value}${unit ? ` ${unit}` : ""}`
  return (
    <div className="ag-brief-field">
      <span className="ag-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="ag-brief-stepper" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Less ${label.toLowerCase()}`}>
          −
        </button>
        <output aria-live="polite">{shown}</output>
        <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
      {hint && <p className="ag-brief-hint">{hint}</p>}
    </div>
  )
}

function Chips<T extends string>({ label, options, selected, onToggle, render, hint }: { label: string; options: readonly T[]; selected: readonly T[]; onToggle: (v: T) => void; render: (v: T) => string; hint?: string }) {
  return (
    <div className="ag-brief-field">
      <span className="ag-label">{label}</span>
      <div className="ag-brief-chips" role="group" aria-label={label}>
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button key={o} type="button" className="ag-brief-chip" aria-pressed={on} onClick={() => onToggle(o)}>
              {render(o)}
            </button>
          )
        })}
      </div>
      {hint && <p className="ag-brief-hint">{hint}</p>}
    </div>
  )
}

function MultiContact({ id, label, contacts, selected, onChange, hint }: { id: string; label: string; contacts: ContactOption[]; selected: string[]; onChange: (ids: string[]) => void; hint?: string }) {
  return (
    <div className="ag-brief-field">
      <span className="ag-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="ag-brief-chips" role="group" aria-labelledby={`${id}-label`}>
        {contacts.length === 0 && <span className="ag-note">No contacts at this client yet — add them under Client access.</span>}
        {contacts.map((c) => {
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              className="ag-brief-chip"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
            >
              {c.name}
              {on && selected[0] === c.id && <span className="ag-brief-chip-tag">decides</span>}
            </button>
          )
        })}
      </div>
      {hint && <p className="ag-brief-hint">{hint}</p>}
    </div>
  )
}

export function BriefForm({
  config,
  onChange,
  contacts,
  disabled,
}: {
  config: BriefConfig
  onChange: (next: BriefConfig) => void
  /** Client-side people at this company, for rounds and offer authority. */
  contacts: ContactOption[]
  disabled?: boolean
}) {
  const set = <K extends keyof BriefConfig>(k: K, v: BriefConfig[K]) => onChange({ ...config, [k]: v })
  const setRound = (i: number, patch: Partial<BriefRound>) => set("rounds", config.rounds.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const toggleDay = (d: Weekday) => set("interviewDays", config.interviewDays.includes(d) ? config.interviewDays.filter((x) => x !== d) : WEEKDAYS.filter((w) => w === d || config.interviewDays.includes(w)))
  const monthOptions = useMemo(() => {
    const out: string[] = []
    const d = new Date()
    for (let i = 0; i < 18; i++) {
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      out.push(`${y}-${String(m).padStart(2, "0")}`)
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [])
  const monthLabel = (ym: string) => {
    if (!ym) return "Not set"
    const [y, m] = ym.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
  }
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name ?? "Not named"

  return (
    <fieldset className="ag-brief-form" disabled={disabled}>
      <Section n={1} title="The rounds" tier={1} sub="What each round is for, who is in it, how long. The room's stage bar, the wave planner and the diary read this; a decider can differ by round.">
        {config.rounds.map((r, i) => (
          <div key={i} className="ag-brief-round">
            <div className="ag-brief-round-n">Round {i + 1}</div>
            <Select id={`r${i}-purpose`} label="What it is for" value={r.purpose} options={ROUND_PURPOSES} onChange={(v) => setRound(i, { purpose: v })} render={(v) => ROUND_PURPOSE_LABEL[v]} />
            <Select id={`r${i}-format`} label="How" value={r.format} options={ROUND_FORMATS} onChange={(v) => setRound(i, { format: v })} render={(v) => ROUND_FORMAT_LABEL[v]} />
            <Select id={`r${i}-len`} label="How long" value={r.durationMinutes} options={DURATIONS_MIN} onChange={(v) => setRound(i, { durationMinutes: v })} render={(v) => `${v} min`} />
            <MultiContact id={`r${i}-who`} label="Who is in it" contacts={contacts} selected={r.interviewerIds} onChange={(ids) => setRound(i, { interviewerIds: ids })} hint={i === 0 ? "Multi-select from the client's contacts. The first named decides." : undefined} />
            {config.rounds.length > 1 && (
              <button type="button" className="ag-btn ag-btn-secondary ag-brief-round-remove" onClick={() => set("rounds", config.rounds.filter((_, j) => j !== i))} aria-label={`Remove round ${i + 1}`}>
                Remove
              </button>
            )}
          </div>
        ))}
        {config.rounds.length < MAX_ROUNDS && (
          <button type="button" className="ag-btn ag-btn-secondary" onClick={() => set("rounds", [...config.rounds, { purpose: "final", format: "in_person", interviewerIds: [], durationMinutes: 60 }])}>
            + Add a round (up to {MAX_ROUNDS})
          </button>
        )}
      </Section>

      <Section n={2} title="Deciding" tier={1}>
        <div className="ag-brief-row">
          <Select id="turnaround" label="Decision turnaround after a round" value={config.decisionTurnaroundDays} options={TURNAROUND_DAYS} onChange={(v) => set("decisionTurnaroundDays", v)} render={(v) => `${v} working day${v === 1 ? "" : "s"}`} hint="Drives the reminders and “I’m done deciding”. A promise the client makes, not a setting you pick alone." />
          <Chips label="Interview days" options={WEEKDAYS} selected={config.interviewDays} onToggle={toggleDay} render={(d) => WEEKDAY_LABEL[d]} hint="Tap to toggle." />
        </div>
        <div className="ag-brief-row">
          <Select id="from" label="From" value={config.windowFrom} options={TIME_STEPS} onChange={(v) => set("windowFrom", v)} />
          <Select id="until" label="Until" value={config.windowTo} options={TIME_STEPS.filter((t) => t > config.windowFrom)} onChange={(v) => set("windowTo", v)} />
          <Select id="notice" label="Notice to candidates" value={config.noticeHours} options={NOTICE_HOURS} onChange={(v) => set("noticeHours", v)} render={(v) => `${v} hours`} />
          <Select id="buffer" label="Buffer" value={config.bufferMinutes} options={BUFFER_MIN} onChange={(v) => set("bufferMinutes", v)} render={(v) => `${v} min`} />
          <Stepper id="maxday" label="Max per day" value={config.maxPerDay} min={MAX_PER_DAY.min} max={MAX_PER_DAY.max} onChange={(v) => set("maxPerDay", v)} />
        </div>
      </Section>

      <Section n={3} title="What the client is shown" tier={1} sub="The agreed default, frozen per submission as today. It is what the candidate's notice describes.">
        <Chips
          label="Shown"
          options={["scores", "evidence", "notes", "cv", "logistics"] as const}
          selected={(Object.keys(config.disclosure) as Array<keyof BriefConfig["disclosure"]>).filter((k) => config.disclosure[k])}
          onToggle={(k) => set("disclosure", { ...config.disclosure, [k]: !config.disclosure[k] })}
          render={(k) => ({ scores: "Score", evidence: "Evidence quotes", notes: "Recruiter notes", cv: "The CV", logistics: "Logistics" })[k]}
          hint="Notes default off; the rest default on."
        />
      </Section>

      <Section n={4} title="The feedback promise" tier={1}>
        <div className="ag-brief-row">
          <Select id="fbmode" label="Unsuccessful candidates get a reason" value={config.feedbackMode} options={FEEDBACK_MODES} onChange={(v) => set("feedbackMode", v)} render={(v) => FEEDBACK_MODE_LABEL[v]} />
          {config.feedbackMode !== "none" && <Select id="fbdays" label="Within" value={config.feedbackDays} options={FEEDBACK_DAYS} onChange={(v) => set("feedbackDays", v)} render={(v) => `${v} working days`} />}
        </div>
      </Section>

      <Section n={5} title="Commercial terms" tier={2} sub="Stated by the agency. The placement record inherits these.">
        <div className="ag-brief-row">
          <Select id="basis" label="Basis" value={config.feeBasis} options={FEE_BASES} onChange={(v) => set("feeBasis", v)} render={(v) => FEE_BASIS_LABEL[v]} />
          <Stepper id="fee" label="Fee" value={config.feePercent} min={0} max={50} step={0.5} unit="%" onChange={(v) => set("feePercent", v)} hint="Steps of 0.5" />
          <Stepper id="rebate" label="Rebate" value={config.rebateWeeks} min={REBATE_WEEKS.min} max={REBATE_WEEKS.max} unit="weeks" onChange={(v) => set("rebateWeeks", v)} />
          <Select id="rshape" label="Rebate shape" value={config.rebateShape} options={REBATE_SHAPES} onChange={(v) => set("rebateShape", v)} render={(v) => REBATE_SHAPE_LABEL[v]} />
          <Select id="invoice" label="Invoice" value={config.invoicePoint} options={INVOICE_POINTS} onChange={(v) => set("invoicePoint", v)} render={(v) => INVOICE_POINT_LABEL[v]} />
        </div>
      </Section>

      <Section n={6} title="Ownership and offer" tier={2}>
        <div className="ag-brief-row">
          <Select id="own" label="Introduced candidates are yours for" value={config.ownershipMonths} options={OWNERSHIP_MONTHS} onChange={(v) => set("ownershipMonths", v)} render={(v) => `${v} months`} />
          <Select id="offer" label="Offer authority" value={config.offerAuthorityContactId ?? ""} options={["", ...contacts.map((c) => c.id)]} onChange={(v) => set("offerAuthorityContactId", v || null)} render={(v) => (v ? contactName(v) : "Not named")} hint="From the client's contacts." />
          <Stepper id="ceiling" label="Up to" value={config.offerCeiling ?? 0} min={0} max={500_000} step={1000} onChange={(v) => set("offerCeiling", v || null)} format={(v) => (v ? `£${v.toLocaleString("en-GB")}` : "Not set")} hint="Steps of £1,000." />
          <Select id="start" label="Start target" value={config.startTargetMonth ?? ""} options={["", ...monthOptions]} onChange={(v) => set("startTargetMonth", v || null)} render={monthLabel} />
          <Stepper id="size" label="Shortlist size" value={config.shortlistSize} min={SHORTLIST_SIZE.min} max={SHORTLIST_SIZE.max} onChange={(v) => set("shortlistSize", v)} />
        </div>
      </Section>

      <Section n={7} title="References" tier={2}>
        <Chips
          label="Every hire needs"
          options={["character", "hr"] as const}
          selected={config.referencesWanted}
          onToggle={(k) => set("referencesWanted", (["character", "hr"] as const).filter((x) => (x === k ? !config.referencesWanted.includes(k) : config.referencesWanted.includes(x))))}
          render={(k) => (k === "hr" ? "HR" : "Character")}
          hint="The default per candidate on this role; changeable per person at close-out."
        />
      </Section>

      <div className="ag-brief-field">
        <label className="ag-label" htmlFor="brief-note">
          Anything else the client should read (optional)
        </label>
        <textarea id="brief-note" className="ag-textarea" rows={3} maxLength={600} value={config.note} onChange={(e) => set("note", e.target.value)} />
        <p className="ag-brief-hint">The one free-text field, and it is optional. 600 characters.</p>
      </div>
    </fieldset>
  )
}
