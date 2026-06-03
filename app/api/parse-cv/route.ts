import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Disable worker — not needed in Node.js environment
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise

  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }
  return pages.join('\n\n')
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[parse-cv] error:', msg)
    return NextResponse.json(
      { error: `Failed to parse file: ${msg}. Please copy and paste your CV text instead.` },
      { status: 500 }
    )
  }
}
