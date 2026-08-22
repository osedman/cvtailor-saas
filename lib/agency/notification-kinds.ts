/**
 * The switchable notification kinds and their copy, in a module with NO server
 * imports.
 *
 * Both screens need this list and the server needs it too, and it cannot come
 * from lib/agency/notify: that module imports sendEmail and createAdminClient,
 * so a client component taking a runtime value from it drags the service-role
 * key into the browser bundle and fails the build. Types are erased and travel
 * fine; constants are not, and do not. Same reason settings-limits.ts exists.
 *
 * The copy here is the Figma frame's copy (Recruiter · Notification
 * preferences), kept beside the keys so the two cannot drift.
 */

/** Every kind a person may switch. brief_answered is deliberately absent: it
 * is a message to somebody's client about their own brief, not a preference a
 * recruiter holds, and migration 29's check constraint refuses to store it. */
export const SWITCHABLE_KINDS = [
  "brief_filed",
  "debrief_recorded",
  "consent_answered",
  "reference_submitted",
  "booking_answered",
  "invite_accepted",
] as const

export type SwitchableKind = (typeof SWITCHABLE_KINDS)[number]

export function isSwitchableKind(v: string): v is SwitchableKind {
  return (SWITCHABLE_KINDS as readonly string[]).includes(v)
}

/** A preference is three-valued on screen and two-valued in the table: "agency"
 * means no row of your own, which is why it is a delete rather than a write. */
export type PrefValue = "on" | "off" | "agency"

export const NOTIFICATION_COPY: Record<
  SwitchableKind,
  { eyebrow: string; title: string; blurb: string }
> = {
  brief_filed: {
    eyebrow: "A brief arrives",
    title: "A hiring manager asks you to hire",
    blurb:
      "The one this was built for. Briefs used to sit unseen for days because nothing said they had landed. Goes to whoever invited that client.",
  },
  debrief_recorded: {
    eyebrow: "A write-up lands",
    title: "An interviewer writes up their round",
    blurb:
      "You are told the write-up exists, never what it says. The answers stay on the dossier where they belong.",
  },
  consent_answered: {
    eyebrow: "A candidate replies",
    title: "Someone answers the recording ask",
    blurb:
      "Their answer is not in the email, and it never reaches the panel interviewing them. That is a promise in the consent copy, not a setting.",
  },
  reference_submitted: {
    eyebrow: "A reference comes back",
    title: "A referee completes a reference",
    blurb: "The reference itself stays in the app. This only tells you it is there to read.",
  },
  booking_answered: {
    eyebrow: "A candidate answers a time",
    title: "Someone confirms or declines their interview",
    blurb:
      "If they cannot make it the slot goes back to the client's board on its own, so this is news rather than a task. Declining a time says nothing about the role.",
  },
  invite_accepted: {
    eyebrow: "A client signs in",
    title: "Your client activates their access",
    blurb:
      "The quietest of the five. It fires once per contact, the first time they use the invite you sent.",
  },
}

/** Short labels for the agency defaults card, where the row is one line. */
export const NOTIFICATION_SHORT: Record<SwitchableKind, string> = {
  brief_filed: "A brief arrives",
  debrief_recorded: "A write-up lands",
  consent_answered: "A candidate replies",
  reference_submitted: "A reference comes back",
  booking_answered: "A candidate answers a time",
  invite_accepted: "A client signs in",
}
