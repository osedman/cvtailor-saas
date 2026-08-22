/**
 * Field limits for the hiring manager's brief, in a module with NO server
 * imports.
 *
 * These exist because the form and the server disagreed. `lib/agency/briefs`
 * caps `jd_raw` at 30,000 — its comment reads "a full job description, not a
 * form field" — while the form applied its 4,000 general field cap to every
 * box except the title. A pasted JD was therefore cut at 4,000 characters in
 * the browser, silently, before the server ever saw it. Typical JDs run three
 * to eight thousand, so this was losing the end of real briefs.
 *
 * Now both sides import these, and `lib/__tests__/brief-limits.test.ts` fails
 * if the form's caps and the server's stop agreeing. Importing them from
 * lib/agency/briefs is not an option: that module pulls in agencyAdmin and the
 * service-role key, the same trap settings-limits.ts exists for.
 */

export const MAX_TITLE = 200
export const MAX_FIELD = 4_000

/** A full job description, not a form field. Mirrors the role route's cap. */
export const MAX_JD = 30_000
