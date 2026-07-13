import { describe, expect, it } from 'vitest'
import { buildCvDocxBlob, buildCvParagraphs } from '@/lib/word'

const SAMPLE = `ALEX RIVERA
alex@email.com | London

PROFESSIONAL SUMMARY
Senior engineer with 8 years experience.

WORK EXPERIENCE
Senior Software Engineer, Contoso — 2021 – Present
• Built payment systems.
• Mentored 4 engineers.

EDUCATION
BSc Computer Science, UCL — 2018

SKILLS
TypeScript, Postgres, Leadership
`

describe('word download', () => {
  it('builds paragraphs for name, sections, roles and bullets', () => {
    const paras = buildCvParagraphs(SAMPLE)
    expect(paras.length).toBeGreaterThan(8)
  })

  it('produces a real OOXML .docx (ZIP) blob', async () => {
    const blob = await buildCvDocxBlob(SAMPLE)
    expect(blob.size).toBeGreaterThan(1000)
    const buf = new Uint8Array(await blob.arrayBuffer())
    // ZIP local file header magic: PK\x03\x04
    expect(Array.from(buf.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('handles empty input without throwing', async () => {
    const blob = await buildCvDocxBlob('')
    expect(blob.size).toBeGreaterThan(0)
  })
})
