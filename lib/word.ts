/**
 * Download plain-text CV content as a REAL Word document (.docx), rendered in
 * whichever template the user picked.
 *
 * This file is the reconciliation of two parallel lines of work:
 *  - main shipped a true .docx via the `docx` package (PR #28) — no more
 *    "compatibility mode" prompt when the file opens on Windows — but with one
 *    hardcoded style;
 *  - staging shipped six templates whose tokens drive BOTH the on-screen
 *    preview and the download, but rendered as Word-wrapped HTML .doc.
 * The merge keeps both wins: the .docx builder below consumes the same token
 * set (lib/cv-templates) as the preview, so what the user sees is what they
 * download, in a file Word treats as native.
 *
 * Every template is single-column with no tables or text boxes: that layout is
 * the main cause of ATS parsing failures, so it's not something a template is
 * allowed to vary. Templates differ in typography and rules only.
 *
 * buildCvHtml (the older HTML rendering) is retained: the unit tests assert
 * template/ATS constraints against it, and it remains a faithful statement of
 * how each template styles each line kind.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from "docx"
import { getTemplate, type CvTemplate, type CvTemplateId } from "./cv-templates"
import {
  isSectionHeading, isBulletLine as isBullet, isRoleLine,
  isStackedCompanyLine, isStackedRoleTitleLine, isStackedDateLine,
} from "./cv-lines"

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** docx wants RRGGBB without the hash. */
const hex = (c: string) => c.replace(/^#/, "")
/** docx TextRun size is half-points. */
const hp = (pt: number) => Math.round(pt * 2)
/** docx characterSpacing is twentieths of a point. */
const cs = (pt: number) => (pt ? Math.round(pt * 20) : undefined)
/** The template's primary face — the stack's generic tail is a CSS concern. */
const primaryFont = (stack: string) => stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "")

const align = (a: "left" | "center") =>
  a === "center" ? AlignmentType.CENTER : AlignmentType.LEFT

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

    // Stacked role / company / dates block — mirrors FormattedCV exactly.
    if (isStackedDateLine(lines, idx)) {
      out.push(
        `<p style="font-size:${t9e.company.sizePt}pt;${t9e.company.italic ? "font-style:italic;" : ""}color:${t9e.company.color};margin:0 0 4pt 0">${esc(t)}</p>`
      )
      return
    }
    if (isStackedCompanyLine(lines, idx)) {
      out.push(
        `<p style="font-size:${t9e.role.sizePt + 1}pt;font-weight:bold;color:${t9e.heading.color};margin:0 0 1pt 0">${esc(t)}</p>`
      )
      return
    }
    if (isStackedRoleTitleLine(lines, idx)) {
      out.push(`<p style="font-size:${t9e.role.sizePt}pt;font-weight:bold;color:${t9e.role.color};margin:9pt 0 1pt 0">${esc(t)}</p>`)
      return
    }

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

/** Parse plain-text CV into docx paragraphs styled by the template's tokens. */
export function buildCvParagraphs(text: string, templateId?: CvTemplateId): Paragraph[] {
  const t9e: CvTemplate = getTemplate(templateId)
  const font = primaryFont(t9e.fontStack)

  const accentBorder = { style: BorderStyle.SINGLE, size: 12, color: hex(t9e.accent), space: 1 }
  const headingBorder = { style: BorderStyle.SINGLE, size: 8, color: hex(t9e.heading.color), space: 1 }
  const thinRule = { style: BorderStyle.SINGLE, size: 8, color: "D8D4CD", space: 1 }

  const lines = (text ?? "").split("\n")
  let firstSection = lines.findIndex(
    (l, i) => i > 0 && isSectionHeading(l.trim()) && l.trim().length > 0,
  )
  if (firstSection === -1) firstSection = 0

  const out: Paragraph[] = []
  let headerClosed = firstSection === 0

  lines.forEach((line, idx) => {
    const t = line.trim()

    if (!headerClosed && idx < firstSection) {
      if (idx === 0 && t) {
        out.push(
          new Paragraph({
            spacing: { after: 40 },
            alignment: align(t9e.name_.align),
            children: [
              new TextRun({
                text: t9e.name_.uppercase ? t.toUpperCase() : t,
                bold: true,
                size: hp(t9e.name_.sizePt),
                font,
                color: hex(t9e.name_.color),
                characterSpacing: cs(t9e.name_.letterSpacingPt),
              }),
            ],
          }),
        )
      } else if (t) {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            alignment: align(t9e.contact.align),
            children: [
              new TextRun({ text: t, size: hp(t9e.contact.sizePt), font, color: hex(t9e.contact.color) }),
            ],
          }),
        )
      }
      if (idx === firstSection - 1) {
        out.push(
          new Paragraph({
            // The header rule is a template choice; without one, just breathe.
            ...(t9e.headerRule ? { border: { bottom: accentBorder } } : {}),
            spacing: { before: 80, after: 200 },
            children: [],
          }),
        )
        headerClosed = true
      }
      return
    }

    if (!t) {
      out.push(new Paragraph({ spacing: { after: 40 }, children: [] }))
      return
    }

    // Stacked role / company / dates block — mirrors FormattedCV exactly.
    if (isStackedDateLine(lines, idx)) {
      out.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: t,
              italics: t9e.company.italic,
              size: hp(t9e.company.sizePt),
              font,
              color: hex(t9e.company.color),
            }),
          ],
        }),
      )
      return
    }
    if (isStackedCompanyLine(lines, idx)) {
      out.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: t, bold: true, size: hp(t9e.role.sizePt + 1), font, color: hex(t9e.heading.color) }),
          ],
        }),
      )
      return
    }
    if (isStackedRoleTitleLine(lines, idx)) {
      out.push(
        new Paragraph({
          spacing: { before: 180, after: 20 },
          children: [
            new TextRun({ text: t, bold: true, size: hp(t9e.role.sizePt), font, color: hex(t9e.role.color) }),
          ],
        }),
      )
      return
    }

    if (isSectionHeading(t)) {
      out.push(
        new Paragraph({
          ...(t9e.heading.rule ? { border: { bottom: headingBorder } } : {}),
          spacing: { before: Math.round(t9e.heading.marginTopPt * 20), after: 120 },
          children: [
            new TextRun({
              text: t9e.heading.uppercase ? t : t.charAt(0) + t.slice(1).toLowerCase(),
              bold: true,
              size: hp(t9e.heading.sizePt),
              font,
              color: hex(t9e.heading.color),
              allCaps: t9e.heading.uppercase,
              characterSpacing: cs(t9e.heading.letterSpacingPt),
            }),
          ],
        }),
      )
      return
    }

    if (isBullet(t)) {
      out.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 280, hanging: 180 },
          children: [
            new TextRun({
              text: `${t9e.bulletChar}  ${t.replace(/^[•\-\*·]\s*/, "")}`,
              size: hp(t9e.bodyText.sizePt),
              font,
              color: hex(t9e.bodyText.color),
            }),
          ],
        }),
      )
      return
    }

    if (isRoleLine(t)) {
      out.push(
        new Paragraph({
          spacing: { before: 140, after: 20 },
          children: [
            new TextRun({ text: t, bold: true, size: hp(t9e.role.sizePt), font, color: hex(t9e.role.color) }),
          ],
        }),
      )
      return
    }

    const prev = lines[idx - 1]?.trim() ?? ""
    if (t.length < 90 && isRoleLine(prev)) {
      out.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: t,
              italics: t9e.company.italic,
              size: hp(t9e.company.sizePt),
              font,
              color: hex(t9e.company.color),
            }),
          ],
        }),
      )
      return
    }

    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: t, size: hp(t9e.bodyText.sizePt), font, color: hex(t9e.bodyText.color) }),
        ],
      }),
    )
  })

  out.push(
    new Paragraph({
      border: { top: thinRule },
      spacing: { before: 440 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Made with Tailr · gettailr.com", size: 16, font, color: "A8A29E" }),
      ],
    }),
  )

  return out
}

export function buildCvDocument(text: string, templateId?: CvTemplateId): Document {
  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(22),
              right: convertMillimetersToTwip(22),
            },
          },
        },
        children: buildCvParagraphs(text, templateId),
      },
    ],
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.download = filename.endsWith(".docx") ? filename : filename.replace(/\.doc$/i, ".docx")
  if (!a.download.endsWith(".docx")) a.download = `${a.download}.docx`
  a.href = url
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the browser has had time to start the download — immediate
  // revoke leaves Safari/Firefox with an empty or missing file.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/** Build a .docx blob for the given CV text (usable in tests without DOM). */
export async function buildCvDocxBlob(text: string, templateId?: CvTemplateId): Promise<Blob> {
  return Packer.toBlob(buildCvDocument(text, templateId))
}

/**
 * Download the CV as a real .docx in the given template. Async — callers may
 * void the promise. Safe no-op when text is empty.
 */
export async function downloadWordDoc(
  text: string,
  filename = "tailored-cv.docx",
  templateId?: CvTemplateId,
): Promise<void> {
  if (typeof document === "undefined") return
  if (!(text ?? "").trim()) return
  const blob = await buildCvDocxBlob(text, templateId)
  triggerDownload(blob, filename)
}
