import { NextRequest, NextResponse } from 'next/server'
import { errorMessage } from '@/lib/error-message'

export const maxDuration = 30

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf.js (via unpdf) needs DOMMatrix etc., which Vercel's Node runtime lacks.
  // Install the polyfills before unpdf loads.
  await import('@/lib/pdf-node-polyfill')
  // unpdf bundles a serverless-safe pdf.js build, so there is no web-worker to
  // configure (the previous pdfjs-dist worker setup failed on Vercel functions).
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n\n') : text
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop()?.toLowerCase()

    let text = ''
    if (ext === 'pdf') {
      text = await extractPdfText(buffer)
    } else if (ext === 'docx') {
      text = await extractDocxText(buffer)
    } else if (ext === 'txt') {
      text = buffer.toString('utf-8')
    } else {
      return NextResponse.json({ error: 'Only PDF, DOCX, and TXT files are supported' }, { status: 400 })
    }

    // Normalise whitespace
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim()

    if (!text || text.length < 30) {
      return NextResponse.json(
        { error: 'Could not extract text — the file may be image-based. Try copying and pasting instead.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ text })
  } catch (err) {
    const msg = errorMessage(err)
    console.error('[parse-cv] error:', msg)
    return NextResponse.json(
      { error: `Failed to parse file: ${msg}. Please copy and paste your CV text instead.` },
      { status: 500 }
    )
  }
}
