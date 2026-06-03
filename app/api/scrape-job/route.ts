import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

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

    // Use Jina AI Reader — free, no API key, strips nav/ads and returns clean text
    // Works on LinkedIn, Indeed, Glassdoor, Reed, and most job boards
    const jinaUrl = `https://r.jina.ai/${parsedUrl.toString()}`

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch page (status ${response.status})`)
    }

    let text = await response.text()

    // Trim to a sensible length — most JDs are 300–800 words
    if (text.length > 8000) {
      text = text.slice(0, 8000) + '\n\n[Truncated for length]'
    }

    if (!text || text.length < 100) {
      return NextResponse.json({ error: 'Could not extract job description from this URL. Try pasting the text manually.' }, { status: 422 })
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
