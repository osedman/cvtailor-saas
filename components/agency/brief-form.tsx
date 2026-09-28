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
 *
 * The job description (board 28, 28 Sep 2026) is the FIRST section, un-
 * numbered, above the rounds: the document the terms are about. Both sides
 * render this form, so `side` picks the upload and download routes and the
 * "added by" words. Uploading only stores the file and returns its id; the
 * id goes into config.jdFileId like any other field, so the page's own
 * Save / Send / Send back carries it and a new file is an amendment.
 */

import { useEffect, useRef, useState, useMemo } from "react"
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

function Section({ n, id, title, tier, sub, children }: { n?: number; id?: string; title: string; tier: 1 | 2; sub?: string; children: React.ReactNode }) {
  const headId = id ?? `brief-s${n}`
  return (
    <section className="ag-brief-section" aria-labelledby={headId}>
      <div className="ag-brief-section-head">
        <h3 id={headId} className="ag-brief-section-title">
          {n !== undefined ? `${n} · ` : ""}
          {title}
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

/** A job description as both pages receive it (BriefView.latest.jd and the
 *  upload route's answer). Declared here, not imported from the server
 *  module: nothing in the browser imports lib/agency/brief-files. */
export interface BriefJdView {
  fileId: string
  name: string
  sizeBytes: number
  contentType: string
  uploadedBySide: "recruiter" | "client"
  createdAt: string
  /** Characters of text read out of the file; 0 = nothing could be read. */
  textChars: number
}

export type BriefFormSide = "recruiter" | "client"

const JD_LIMIT_BYTES = 10 * 1024 * 1024
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "184 KB", "1.2 MB" — the size as the board writes it. */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** The side's own download route for a file on this brief. */
export function jdHref(side: BriefFormSide, briefId: string, fileId: string): string {
  return `${side === "recruiter" ? "/api/agency" : "/api/hiring"}/briefs/${briefId}/jd/${fileId}`
}

function jdExt(f: BriefJdView): string {
  const ext = f.name.split(".").pop()?.toUpperCase() ?? ""
  return ["PDF", "DOCX", "TXT"].includes(ext) ? ext : "FILE"
}

function jdMeta(f: BriefJdView, side: BriefFormSide, agencyName: string, contactName: string): string {
  const who = f.uploadedBySide === side ? "you" : f.uploadedBySide === "recruiter" ? agencyName : contactName
  const d = new Date(f.createdAt)
  const when = Number.isNaN(d.getTime()) ? "" : ` · ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return `${fileSize(f.sizeBytes)} · Added by ${who}${when} · ${f.textChars > 0 ? "Text read" : "No text found"}`
}

/**
 * The job description section — board 28, band A. Three states: nothing
 * attached (the dashed zone), attached (the file row), and replaced on an
 * amendment (the row plus CHANGED · WAS {old name}). The zone is a button
 * that opens the picker and also takes a drop.
 */
function JdSection({
  side,
  briefId,
  fileId,
  known,
  baseline,
  previousJd,
  amending,
  agencyName,
  contactName,
  onPick,
  onError,
  onUploaded,
  onUploadingChange,
}: {
  side: BriefFormSide
  briefId: string
  fileId: string | null
  known: Array<BriefJdView | null | undefined>
  /** The latest version's file — what an amendment is measured against. */
  baseline: BriefJdView | null
  previousJd: BriefJdView | null
  amending: boolean
  agencyName: string
  contactName: string
  onPick: (fileId: string | null) => void
  onError: (message: string | null) => void
  onUploaded: (file: BriefJdView) => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const zoneRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const [reading, setReading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  /** One status line, always mounted, so the start and the end of an upload
   *  are both announced (a live region inserted with its text often is not). */
  const [live, setLive] = useState("")
  const current = fileId ? (known.find((f) => f?.fileId === fileId) ?? null) : null

  // An upload that outlives the form must not write onto a config the page
  // has since reset: unmounting aborts it, and an aborted upload says nothing.
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => {
    const c = ctrl
    return () => c.current?.abort()
  }, [])

  // Where focus goes once the row or the zone has re-rendered in place of
  // the control that was pressed — never back to the top of the page.
  const focusNext = useRef<"name" | "zone" | null>(null)
  useEffect(() => {
    const target = focusNext.current
    focusNext.current = null
    if (target === "name") nameRef.current?.focus()
    else if (target === "zone") zoneRef.current?.focus()
  }, [fileId])

  // What an amendment replaced: this edit's change against the latest
  // version first, else the latest version's own change against the one
  // before it. A first draft has nothing to be measured against.
  const baselineId = baseline?.fileId ?? null
  /** THIS edit changes the file — only then is a signature cleared by it.
   *  An inherited change (the latest version's own) keeps the pill, but the
   *  side that made it has already signed, so no sentence blames anyone. */
  const thisEdit = amending && fileId !== baselineId
  const was = !amending
    ? undefined
    : thisEdit
      ? (baseline?.name ?? "none attached")
      : previousJd && previousJd.fileId !== fileId
        ? previousJd.name
        : undefined
  const otherSig = side === "recruiter" ? "the client's" : `${agencyName}'s`

  async function upload(file: File) {
    if (reading) return
    onError(null)
    if (file.size > JD_LIMIT_BYTES) return onError("File too large (max 10 MB)")
    const c = new AbortController()
    ctrl.current = c
    setReading(true)
    onUploadingChange?.(true)
    setLive("Reading the file…")
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${side === "recruiter" ? "/api/agency" : "/api/hiring"}/briefs/${briefId}/jd`, { method: "POST", body: form, signal: c.signal })
      const body = (await res.json().catch(() => ({}))) as { file?: BriefJdView; error?: unknown }
      if (c.signal.aborted) return
      if (!res.ok || !body.file) {
        setLive("")
        return onError(typeof body.error === "string" ? body.error : "Could not attach that file. Nothing has changed.")
      }
      onUploaded(body.file)
      focusNext.current = "name"
      setLive(`Attached ${body.file.name}`)
      onPick(body.file.fileId)
    } catch {
      if (c.signal.aborted) return
      setLive("")
      onError("Could not attach that file. Nothing has changed.")
    } finally {
      if (ctrl.current === c) ctrl.current = null
      setReading(false)
      // Always, even when aborted: the page must not stay locked.
      onUploadingChange?.(false)
      if (input.current) input.current.value = ""
    }
  }

  const open = () => {
    if (!reading) input.current?.click()
  }
  const remove = () => {
    if (reading) return
    focusNext.current = "zone"
    setLive("Job description removed")
    onPick(null)
  }

  return (
    <Section
      id="brief-jd"
      title="The job description"
      tier={1}
      sub="The document the terms are about. The client sees it and can replace it; a new file is an amendment both sides sign again. When a role runs on this brief, the description lands in its intake."
    >
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.txt"
        className="ag-brief-jd-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
      <p className="ag-sr-only" role="status" aria-live="polite">
        {live}
      </p>
      {!fileId ? (
        <button
          ref={zoneRef}
          type="button"
          className="ag-brief-jd-drop"
          data-over={dragOver || undefined}
          aria-busy={reading || undefined}
          aria-describedby="brief-jd-drop-sub"
          aria-disabled={reading || undefined}
          onClick={open}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f && !reading) void upload(f)
          }}
        >
          {reading ? (
            <span className="ag-brief-jd-drop-title">Reading the file…</span>
          ) : (
            <>
              <span className="ag-brief-jd-drop-title">Attach the job description</span>
              <span className="ag-brief-jd-drop-sub" id="brief-jd-drop-sub">
                PDF, DOCX or TXT, up to 10 MB. Drop it here or choose a file.
              </span>
              <span className="ag-btn ag-btn-secondary" aria-hidden="true">
                Choose a file
              </span>
            </>
          )}
        </button>
      ) : (
        <>
          <div className="ag-brief-jd-file" aria-busy={reading || undefined}>
            <span className="ag-brief-jd-ext ag-meta" aria-hidden="true">
              {current ? jdExt(current) : "FILE"}
            </span>
            <div className="ag-brief-jd-main">
              <span className="ag-brief-jd-name" ref={nameRef} tabIndex={-1}>
                {current?.name ?? "The attached file"}
              </span>
              {current && <span className="ag-meta ag-brief-jd-meta">{jdMeta(current, side, agencyName, contactName)}</span>}
            </div>
            <div className="ag-brief-jd-actions">
              {/* The controls stay mounted through a Replace (aria-disabled,
                  not disabled, and not swapped out) so focus stays put. */}
              <a className="ag-brief-jd-link" href={jdHref(side, briefId, fileId)} download aria-label={`Download ${current?.name ?? "the job description"}`}>
                Download
              </a>
              <button type="button" className="ag-brief-jd-quiet" onClick={open} aria-disabled={reading || undefined} aria-label={reading ? "Reading the file…" : "Replace the job description"}>
                {reading ? "Reading the file…" : "Replace"}
              </button>
              <button type="button" className="ag-brief-jd-link" onClick={remove} aria-disabled={reading || undefined} aria-label="Remove the job description">
                Remove
              </button>
            </div>
          </div>
          {current && current.textChars === 0 ? (
            <p className="ag-brief-hint" data-jd-no-text>
              {side === "recruiter"
                ? "Nothing could be read from this file — a scan, perhaps. The role's intake will stay empty; paste the description there instead."
                : `Nothing could be read from this file — a scan, perhaps. The role's intake will stay empty; ${agencyName} will paste the description there instead.`}
            </p>
          ) : (
            <p className="ag-brief-hint">
              {side === "recruiter"
                ? "Read once for the role's intake. Nothing is parsed until you press Extract requirements there."
                : `Read once for the role's intake. Nothing is parsed until ${agencyName} presses Extract requirements there.`}
            </p>
          )}
        </>
      )}
      {was !== undefined && (
        <div className="ag-brief-jd-was">
          <span className="ag-brief-changed">Changed · was {was}</span>
          {thisEdit && (
            <span className="ag-brief-hint">
              {fileId ? "A new file" : "Removing the file"} is a new version: {otherSig} signature is cleared until they approve it.
            </span>
          )}
        </div>
      )}
    </Section>
  )
}

export function BriefForm({
  config,
  onChange,
  contacts,
  disabled,
  side,
  briefId,
  jd,
  previousJd,
  amending,
  agencyName,
  contactName: briefContactName,
  onError,
  uploads,
  onUploaded,
  onUploadingChange,
}: {
  config: BriefConfig
  onChange: (next: BriefConfig) => void
  /** Client-side people at this company, for rounds and offer authority. */
  contacts: ContactOption[]
  disabled?: boolean
  /** Whose page this is: picks the upload/download routes and "added by". */
  side: BriefFormSide
  briefId: string
  /** BriefView.latest.jd — the file the latest version carries. */
  jd: BriefJdView | null
  /** BriefView.previous?.jd — for "was" on an amendment. */
  previousJd: BriefJdView | null
  /** Editing a SENT brief: a different file is a new version. */
  amending: boolean
  agencyName: string
  contactName: string
  /** The page's error banner. The upload route's refusal is a sentence. */
  onError: (message: string | null) => void
  /** Files attached in this session, when the page keeps them across a
   *  remount (the client's page swaps the form for the summary). */
  uploads?: BriefJdView[]
  onUploaded?: (file: BriefJdView) => void
  /** True while a file is being read. The page holds its Send / Save /
   *  Approve / Undo while it is, so a version never leaves without the file
   *  the person is attaching, and a late upload never lands on a reset draft. */
  onUploadingChange?: (uploading: boolean) => void
}) {
  // An upload resolves after the person may have changed another field;
  // the id goes onto the config as it is THEN, not as it was on click.
  const latest = useRef(config)
  useEffect(() => {
    latest.current = config
  }, [config])
  const [attached, setAttached] = useState<BriefJdView[]>([])
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
      <JdSection
        side={side}
        briefId={briefId}
        fileId={config.jdFileId}
        known={[...attached, ...(uploads ?? []), jd, previousJd]}
        baseline={jd}
        previousJd={previousJd}
        amending={amending}
        agencyName={agencyName}
        contactName={briefContactName}
        onPick={(id) => onChange({ ...latest.current, jdFileId: id })}
        onError={onError}
        onUploaded={(f) => {
          setAttached((a) => [f, ...a])
          onUploaded?.(f)
        }}
        onUploadingChange={onUploadingChange}
      />

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
