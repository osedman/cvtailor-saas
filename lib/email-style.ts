/**
 * The face mail is set in.
 *
 * Its own module, not lib/email.ts, for the reason lib/email-senders.ts gives:
 * a dozen tests mock "@/lib/email" with sendEmail alone, so anything else
 * exported from there arrives undefined inside those tests and lands as the
 * string "undefined" in a style attribute.
 *
 * Webfonts do not survive email — Gmail strips @font-face and Outlook ignores
 * it — so this names Noto Sans first for the clients that already have it and
 * falls back to the system sans everywhere else. It is the product's face
 * where it can be, and never a mismatch: the point is that nothing the agency
 * side sends arrives in a different voice from the screens it came from.
 *
 * Mono is deliberately absent. The one machine token in mail — the six-digit
 * sign-in code — sets ui-monospace itself, and is allowlisted in the
 * typography guardrail for exactly that.
 */
export const EMAIL_SANS =
  "'Noto Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
