/**
 * Download plain-text CV content as a Word document (.doc), rendered in
 * whichever template the user picked. All styling comes from the token set in
 * lib/cv-templates — the same one that drives the on-screen preview — so the
 * download can't drift from what the user saw.
 *
 * Every template is single-column with no tables or text boxes: that layout is
 * the main cause of ATS parsing failures, so it's not something a template is
 * allowed to vary. Templates differ in typography and rules only.
 *
 * Word opens HTML wrapped in a .doc container natively — no library needed.
 */

import { getTemplate, type CvTemplate, type CvTemplateId } from "./cv-templates"

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const isSectionHeading = (t: string) => /^[A-Z][A-Z\s&/,'()-]+$/.test(t) && t.length >= 3
const isBullet = (t: string) => /^[•\-\*·]/.test(t)
// A role/employer line: contains a 4-digit year or "Present", reasonably short
const isRoleLine = (t: string) => (/\b(19|20)\d{2}\b|Present/i.test(t)) && t.length < 130

/** Build the full Word-compatible HTML document for a plain-text CV */
export function buildCvHtml(text: string, templateId?: CvTemplateId): string {
  const t9e: CvTemplate = getTemplate(templateId)
  const lines = (text ?? "").split("\n")

  // Header block = everything before the first section heading. Line 0 is
  // always the candidate's name (often ALL CAPS too), so search from line 1.
  let firstSection = lines.findIndex(
    (l, i) => i > 0 && isSectionHeading(l.trim()) && l.trim().length > 0
  )
  if (firstSection === -1) firstSection = 0

  const out: string[] = []
  let headerClosed = firstSection === 0

  const ls = (pt: number) => (pt ? `letter-spacing:${pt}pt;` : "")

  lines.forEach((line, idx) => {
    const t = line.trim()

    // ── Header block ──
    if (!headerClosed && idx < firstSection) {
      if (idx === 0 && t) {
        const label = t9e.name_.uppercase ? t.toUpperCase() : t
        out.push(
          `<p style="font-size:${t9e.name_.sizePt}pt;font-weight:bold;color:${t9e.name_.color};${ls(t9e.name_.letterSpacingPt)}text-align:${t9e.name_.align};margin:0 0 2pt 0">${esc(label)}</p>`
        )
      } else if (t) {
        out.push(
          `<p style="font-size:${t9e.contact.sizePt}pt;color:${t9e.contact.color};text-align:${t9e.contact.align};margin:0 0 3pt 0">${esc(t)}</p>`
        )
      }
      // Close the header just before the first section
      if (idx === firstSection - 1) {
        if (t9e.headerRule) {
          out.push(`<p style="border-bottom:1.5pt solid ${t9e.accent};font-size:1pt;margin:4pt 0 10pt 0">&nbsp;</p>`)
        } else {
          out.push(`<p style="font-size:6pt;margin:0">&nbsp;</p>`)
        }
        headerClosed = true
      }
      return
    }

    if (!t) { out.push(`<p style="font-size:4pt;margin:0">&nbsp;</p>`); return }

    if (isSectionHeading(t)) {
      const label = t9e.heading.uppercase ? t.toUpperCase() : t.charAt(0) + t.slice(1).toLowerCase()
      const rule = t9e.heading.rule ? `border-bottom:1pt solid ${t9e.heading.color};padding-bottom:2pt;` : ""
      out.push(
        `<p style="font-size:${t9e.heading.sizePt}pt;font-weight:bold;color:${t9e.heading.color};text-transform:${t9e.heading.uppercase ? "uppercase" : "none"};${ls(t9e.heading.letterSpacingPt)}${rule}margin:${t9e.heading.marginTopPt}pt 0 6pt 0">${esc(label)}</p>`
      )
      return
    }

    if (isBullet(t)) {
      out.push(
        `<p style="font-size:${t9e.bodyText.sizePt}pt;color:${t9e.bodyText.color};margin:0 0 3pt 14pt;text-indent:-9pt">${t9e.bulletChar}&nbsp;&nbsp;${esc(t.replace(/^[•\-\*·]\s*/, ""))}</p>`
      )
      return
    }

    if (isRoleLine(t)) {
      out.push(`<p style="font-size:${t9e.role.sizePt}pt;font-weight:bold;color:${t9e.role.color};margin:7pt 0 1pt 0">${esc(t)}</p>`)
      return
    }

    // Company/location style lines: shortish, directly under a role line
    const prev = lines[idx - 1]?.trim() ?? ""
    if (t.length < 90 && isRoleLine(prev)) {
      out.push(
        `<p style="font-size:${t9e.company.sizePt}pt;${t9e.company.italic ? "font-style:italic;" : ""}color:${t9e.company.color};margin:0 0 4pt 0">${esc(t)}</p>`
      )
      return
    }

    out.push(
      `<p style="font-size:${t9e.bodyText.sizePt}pt;color:${t9e.bodyText.color};margin:0 0 4pt 0;line-height:${t9e.bodyText.lineHeight}">${esc(t)}</p>`
    )
  })

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8"><title>CV</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm 2.2cm; }
  body { font-family: ${t9e.fontStack}; color: ${t9e.bodyText.color}; }
</style>
</head>
<body>${out.join("\n")}
<p style="margin:22pt 0 0 0;border-top:0.75pt solid #d8d4cd;padding-top:6pt;text-align:center;font-size:8pt;color:#a8a29e;letter-spacing:0.4pt;">Made with Tailr &middot; gettailr.com</p>
</body></html>`
}

export function downloadWordDoc(
  text: string,
  filename = "tailored-cv.doc",
  templateId?: CvTemplateId
) {
  const blob = new Blob(["﻿" + buildCvHtml(text, templateId)], { type: "application/msword" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
