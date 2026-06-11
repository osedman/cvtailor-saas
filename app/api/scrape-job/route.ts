import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** Strip HTML tags and decode common entities into readable plain text */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extract a LinkedIn job ID from any of the URL shapes LinkedIn uses */
function linkedInJobId(url: URL): string | null {
  // https://www.linkedin.com/jobs/view/4012345678/
  const viewMatch = url.pathname.match(/\/jobs\/view\/(\d+)/)
  if (viewMatch) return viewMatch[1]
  // https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678
  // https://www.linkedin.com/jobs/search/?currentJobId=4012345678&...
  const param = url.searchParams.get('currentJobId')
  if (param && /^\d+$/.test(param)) return param
  return null
}

/**
 * Fetch a LinkedIn job via the public guest API — works without login,
 * unlike the job page itself which is often login-walled.
 */
async function scrapeLinkedIn(jobId: string): Promise<string | null> {
  const res = await fetch(
    `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`,
    {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!res.ok) return null
  const html = await res.text()

  const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? ''

  const title = htmlToText(pick(/<h2[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h2>/))
  const company = htmlToText(pick(/<a[^>]*topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/))
  const location = htmlToText(pick(/<span[^>]*topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/))
  const descriptionHtml = pick(/<div[^>]*description__text[^>]*>([\s\S]*?)<\/div>\s*<\/section>/)
    || pick(/<div[^>]*show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)
  const description = htmlToText(descriptionHtml)

  if (!description || description.length < 100) return null

  const header = [title, company, location].filter(Boolean).join('\n')
  return header ? `${header}\n\n${description}` : description
}

/** Generic fallback — Jina AI Reader strips nav/ads from most job boards */
async function scrapeGeneric(url: URL): Promise<string | null> {
  const res = await fetch(`https://r.jina.ai/${url.toString()}`, {
    headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return null
  const text = (await res.text()).trim()
  return text.length >= 100 ? text : null
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    let text: string | null = null

    // LinkedIn: use the guest API first — survives the login wall
    if (/(^|\.)linkedin\.com$/.test(parsedUrl.hostname)) {
      const jobId = linkedInJobId(parsedUrl)
      if (jobId) {
        text = await scrapeLinkedIn(jobId)
      }
    }

    // Everything else (or LinkedIn fallback): Jina Reader
    if (!text) {
      text = await scrapeGeneric(parsedUrl)
    }

    if (!text) {
      return NextResponse.json(
        { error: 'Could not extract the job description from this URL. Try pasting the text manually.' },
        { status: 422 }
      )
    }

    if (text.length > 8000) {
      text = text.slice(0, 8000) + '\n\n[Truncated for length]'
    }

    return NextResponse.json({ text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scrape-job] error:', msg)
    return NextResponse.json({
      error: msg.includes('timed out') || msg.includes('timeout')
        ? 'The page took too long to load. Try pasting the job description manually.'
        : 'Could not fetch this URL. Try pasting the job description manually.'
    }, { status: 500 })
  }
}
