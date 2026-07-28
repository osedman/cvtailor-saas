import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'
import { isMarketEnabled, fetchMarket } from '@/lib/job-market'

export const maxDuration = 30

/**
 * Admin-only diagnostic for the live job-market integration.
 *
 * Exists because "POST /api/career-path/market → 200" tells you nothing: the
 * route answers 200 with `{enabled:false}` when the integration is off, so a
 * silent misconfiguration looks identical to success. This reports which
 * PRECONDITION failed, and then actually calls Reed.
 *
 * Reports presence and lengths only — never the key itself.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const key = process.env.REED_API_KEY ?? ''
  const env = {
    reedKeyPresent: key.length > 0,
    reedKeyLength: key.length,
    // A key pasted with quotes or whitespace is a classic silent failure.
    reedKeyHasWhitespace: key !== key.trim(),
    reedKeyHasQuotes: key.startsWith('"') || key.startsWith("'"),
    killSwitchValue: process.env.MARKET_INSIGHTS_ENABLED ?? '(unset)',
    isMarketEnabled: isMarketEnabled(),
  }

  // Probe Reed directly so we separate "our config" from "their API".
  let directProbe: Record<string, unknown> = { skipped: 'no key' }
  if (key) {
    try {
      const url = new URL('https://www.reed.co.uk/api/1.0/search')
      url.searchParams.set('keywords', 'business analyst')
      url.searchParams.set('resultsToTake', '10')
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${Buffer.from(`${key.trim()}:`).toString('base64')}` },
        signal: AbortSignal.timeout(10_000),
      })
      const text = await res.text()
      directProbe = {
        httpStatus: res.status,
        ok: res.ok,
        bodyPreview: text.slice(0, 200),
      }
    } catch (err) {
      directProbe = { threw: err instanceof Error ? err.message : String(err) }
    }
  }

  // And the real code path, so a mismatch between the two is visible.
  let viaFetchMarket: Record<string, unknown>
  try {
    const m = await fetchMarket('business analyst', 'GB')
    viaFetchMarket = m
      ? { returned: 'data', totalRoles: m.totalRoles, hasBand: !!m.band, jobs: m.jobs.length }
      : { returned: 'null' }
  } catch (err) {
    viaFetchMarket = { threw: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json({ env, directProbe, viaFetchMarket })
}
