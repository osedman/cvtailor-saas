import { describe, it, expect } from 'vitest'
import { buildCvHtml } from '@/lib/word'
import { CV_TEMPLATES, TEMPLATE_LIST, toTemplateId, DEFAULT_TEMPLATE_ID } from '@/lib/cv-templates'

const CV = `JANE DOE
jane@example.com · London

EXPERIENCE

Senior Analyst, Northwind — 2021 to Present
Northwind Group, London
• Led a pricing review that lifted margin by 4 points

EDUCATION
BSc Economics, University of Leeds`

describe('toTemplateId', () => {
  it('accepts every shipped template id', () => {
    for (const t of TEMPLATE_LIST) expect(toTemplateId(t.id)).toBe(t.id)
  })

  // A retired template id left behind in the DB must degrade, never explode
  it('falls back to the default for unknown, null or non-string values', () => {
    expect(toTemplateId('no-such-template')).toBe(DEFAULT_TEMPLATE_ID)
    expect(toTemplateId(null)).toBe(DEFAULT_TEMPLATE_ID)
    expect(toTemplateId(undefined)).toBe(DEFAULT_TEMPLATE_ID)
    expect(toTemplateId(42)).toBe(DEFAULT_TEMPLATE_ID)
  })
})

describe('buildCvHtml', () => {
  it('renders each template with its own font stack and bullet', () => {
    for (const tpl of TEMPLATE_LIST) {
      const html = buildCvHtml(CV, tpl.id)
      expect(html).toContain(tpl.fontStack)
      expect(html).toContain(tpl.bulletChar)
    }
  })

  it('defaults to the default template when no id is given', () => {
    expect(buildCvHtml(CV)).toContain(CV_TEMPLATES[DEFAULT_TEMPLATE_ID].fontStack)
  })

  // The ATS promise: layout never varies, only typography. Multi-column
  // layouts and tables are the main cause of parsing failures.
  it('never emits tables, columns or text boxes in any template', () => {
    for (const tpl of TEMPLATE_LIST) {
      const html = buildCvHtml(CV, tpl.id)
      expect(html).not.toMatch(/<table|<td|<th\b/i)
      expect(html).not.toMatch(/column-count|display:\s*flex|display:\s*grid/i)
    }
  })

  it('keeps every body size at 10pt or above', () => {
    for (const tpl of TEMPLATE_LIST) {
      expect(tpl.bodyText.sizePt).toBeGreaterThanOrEqual(10)
      expect(tpl.contact.sizePt).toBeGreaterThanOrEqual(10)
      expect(tpl.role.sizePt).toBeGreaterThanOrEqual(10)
    }
  })

  it('preserves the CV content itself regardless of template', () => {
    for (const tpl of TEMPLATE_LIST) {
      const html = buildCvHtml(CV, tpl.id)
      expect(html).toContain('Led a pricing review that lifted margin by 4 points')
      expect(html).toContain('BSc Economics, University of Leeds')
    }
  })

  it('escapes HTML in the CV text so a stray angle bracket cannot inject markup', () => {
    const html = buildCvHtml('JANE <script>alert(1)</script>\n\nEXPERIENCE\nDid <b>things</b>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
