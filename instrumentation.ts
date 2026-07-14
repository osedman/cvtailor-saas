import * as Sentry from "@sentry/nextjs"

// Server + edge Sentry init. No-op unless NEXT_PUBLIC_SENTRY_DSN is set, so
// this is safe to ship before the DSN is configured.
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === "production",
  })
}

// Captures errors thrown in nested React Server Components and route handlers.
export const onRequestError = Sentry.captureRequestError
