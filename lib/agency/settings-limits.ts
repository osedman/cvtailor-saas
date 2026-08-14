/**
 * The bounds on agency settings, in a module with NO server imports.
 *
 * These mirror the CHECK constraints on agency.agencies exactly, and both the
 * server (lib/agency/settings) and the settings screen need them — the server
 * to enforce, the screen to set min/max and say the cap out loud.
 *
 * They live here rather than in settings.ts because that module imports
 * agencyAdmin, which reaches for next/headers and the service-role key. A
 * client component importing a runtime value from it drags the whole
 * server-only chain into the browser bundle and fails the build. Types are
 * erased and travel fine; constants are not, and do not.
 */

export const RETENTION_MIN = 1
export const RETENTION_MAX = 3650

export const NOTICE_MIN = 0
/** Hard cap, and not a preference: a candidate learning months later that
 * their CV has been held is exactly what bounding the delay prevents. */
export const NOTICE_MAX = 28
