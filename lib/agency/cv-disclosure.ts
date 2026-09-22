/**
 * The candidate's CV, as the hiring manager sees it.
 *
 * THE RULE CHANGED ON 22 SEP 2026. Until today a client saw a ref and
 * whatever a submission snapshot disclosed, and `client-auth.ts` said in so
 * many words that a CV must never reach them. Ose's decision: that is not
 * how the process works. A hiring manager reads the CV and the evidence and
 * decides from them; withholding it was Tailr describing a market that does
 * not exist. So the name, the evidence and the CV are disclosable through a
 * submission — deliberately, per submission, and recorded.
 *
 * WHAT DID NOT CHANGE, and must not:
 *
 *   · CONTACT DETAILS NEVER TRAVEL. Email, phone, postal address and
 *     personal links are stripped from the text before it leaves this
 *     module. This is the agency's fee as much as the candidate's privacy:
 *     a client who can ring the candidate directly can cut the recruiter
 *     out of the placement they are owed for. `redactContactDetails` is the
 *     only door, and it strips rather than trusting a parser.
 *   · THE TEXT IS SERVED LIVE, NEVER FROZEN INTO THE SNAPSHOT. Everything
 *     else in a submission is frozen, on purpose. A CV is not, because
 *     `agency.purge_candidate()` nulls `candidates.cv_text` when retention
 *     expires, and a copy sealed inside a submissions row would survive the
 *     erasure it exists to honour. The frozen part is the DECISION — the
 *     `cv` switch in the snapshot — and the live part is the document.
 *   · A REDACTED CANDIDATE STAYS REDACTED. `candidates.redacted` outranks
 *     the switch, in both directions and without exception.
 *   · EVERY VIEW IS AUDITED. The route writes the row; see
 *     app/api/hiring/roles/[roleId]/candidates/[ref]/cv/route.ts.
 *
 * The DPIA has not been done. It is logged as OPEN in docs/DPIA-DECISIONS.md
 * and a weekly reminder goes to Ose until it closes.
 */

/** Bumped when the redaction rules change, so a reviewer can tell which ran. */
export const CV_REDACTION_VERSION = "v1-2026-09-22"

export interface RedactedCv {
  /** The CV text with contact details replaced by a marker. */
  text: string
  /** How many of each kind were removed. Counts only — never the values. */
  removed: {
    emails: number
    phones: number
    links: number
    postcodes: number
  }
}

/** What the reader sees where something was taken out. */
const MARK = "[removed]"

/**
 * An email address. Deliberately greedy about what a local part may hold:
 * a CV that writes "priya (dot) raman @ example.com" is not defeating this
 * on purpose, but one that writes a normal address must never slip through.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/**
 * A phone number. UK mobiles and landlines, international +44/+1 forms, and
 * the spaced and bracketed shapes people actually type. The shortest thing
 * treated as a number is nine digits, so a date range ("2021-2024") and a
 * salary ("£65,000") survive.
 */
const PHONE = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(0\d{1,4}\)|0\d{1,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b|\b\+\d{9,15}\b/g

/**
 * Personal links. LinkedIn, GitHub and the rest are a way to reach someone,
 * so they go the same way as the phone number.
 */
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi

/**
 * A UK postcode, full or outward-only, which is the piece of an address
 * that identifies a household. The rest of an address survives as text —
 * "Manchester" is where they work, not how to knock on their door.
 */
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi

/**
 * Strip every way of reaching this person out of their CV.
 *
 * Runs on the extracted text, not the original file: the file is a PDF
 * whose header block cannot be edited safely, and handing it over would
 * hand over the contact details with it.
 */
export function redactContactDetails(raw: string | null | undefined): RedactedCv {
  const removed = { emails: 0, phones: 0, links: 0, postcodes: 0 }
  if (!raw || typeof raw !== "string") return { text: "", removed }

  let text = raw
  // Email first: an address contains no phone or postcode, but a naive
  // phone pass over "+44..." inside a URL would corrupt a link before the
  // link rule ever sees it.
  text = text.replace(EMAIL, () => {
    removed.emails += 1
    return MARK
  })
  text = text.replace(LINK, () => {
    removed.links += 1
    return MARK
  })
  text = text.replace(PHONE, () => {
    removed.phones += 1
    return MARK
  })
  text = text.replace(POSTCODE, () => {
    removed.postcodes += 1
    return MARK
  })
  return { text, removed }
}

/** True when anything at all was taken out — the UI says so, in words. */
export function anythingRemoved(r: RedactedCv): boolean {
  return r.removed.emails + r.removed.phones + r.removed.links + r.removed.postcodes > 0
}
