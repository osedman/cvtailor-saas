/**
 * Download plain-text CV content as a real Word document (.docx), rendered in
 * the "Modern Clean CV" template style:
 *   - Calibri throughout
 *   - Name: 22pt bold, slate blue #2E5266
 *   - Contact/headline block: grey #595959, separated by a slate rule
 *   - Section headings: bold #2E5266 uppercase with a thin bottom rule
 *   - Role lines: bold; company lines: italic grey; body/bullets: dark grey
 *
 * Uses the `docx` package (OOXML). The previous HTML-as-.doc approach opened as
 * raw markup on many Macs and failed for users without desktop Word.
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

const ACCENT = "2E5266"
const GREY = "595959"
const BODY = "3B3B3B"
const FONT = "Calibri"

const isSectionHeading = (t: string) => /^[A-Z][A-Z\s&/,'()-]+$/.test(t) && t.length >= 3
const isBullet = (t: string) => /^[•\-\*·]/.test(t)
const isRoleLine = (t: string) => (/\b(19|20)\d{2}\b|Present/i.test(t)) && t.length < 130

const accentBorder = {
  style: BorderStyle.SINGLE,
  size: 12,
  color: ACCENT,
  space: 1,
}

const thinRule = {
  style: BorderStyle.SINGLE,
  size: 8,
  color: "D8D4CD",
  space: 1,
}

function emptyLine(): Paragraph {
  return new Paragraph({ spacing: { after: 40 }, children: [] })
}

/** Parse plain-text CV into docx paragraphs matching the Modern Clean template. */
export function buildCvParagraphs(text: string): Paragraph[] {
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
            children: [
              new TextRun({
                text: t,
                bold: true,
                size: 44, // 22pt
                font: FONT,
                color: ACCENT,
              }),
            ],
          }),
        )
      } else if (t) {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: t, size: 21, font: FONT, color: GREY }),
            ],
          }),
        )
      }
      if (idx === firstSection - 1) {
        out.push(
          new Paragraph({
            border: { bottom: accentBorder },
            spacing: { before: 80, after: 200 },
            children: [],
          }),
        )
        headerClosed = true
      }
      return
    }

    if (!t) {
      out.push(emptyLine())
      return
    }

    if (isSectionHeading(t)) {
      out.push(
        new Paragraph({
          border: { bottom: accentBorder },
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: t,
              bold: true,
              size: 23, // ~11.5pt
              font: FONT,
              color: ACCENT,
              allCaps: true,
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
              text: `•  ${t.replace(/^[•\-\*·]\s*/, "")}`,
              size: 21,
              font: FONT,
              color: BODY,
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
            new TextRun({
              text: t,
              bold: true,
              size: 22,
              font: FONT,
              color: "1A1A1A",
            }),
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
              italics: true,
              size: 21,
              font: FONT,
              color: GREY,
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
          new TextRun({ text: t, size: 21, font: FONT, color: BODY }),
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
        new TextRun({
          text: "Made with Tailr · gettailr.com",
          size: 16,
          font: FONT,
          color: "A8A29E",
        }),
      ],
    }),
  )

  return out
}

export function buildCvDocument(text: string): Document {
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
        children: buildCvParagraphs(text),
      },
    ],
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".docx") ? filename : filename.replace(/\.doc$/i, ".docx")
  if (!a.download.endsWith(".docx")) a.download = `${a.download}.docx`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the browser has had time to start the download — immediate
  // revoke leaves Safari/Firefox with an empty or missing file.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/** Build a .docx blob for the given CV text (usable in tests without DOM). */
export async function buildCvDocxBlob(text: string): Promise<Blob> {
  return Packer.toBlob(buildCvDocument(text))
}

/**
 * Download the CV as a real .docx. Async — callers may void the promise.
 * Safe no-op when text is empty.
 */
export async function downloadWordDoc(
  text: string,
  filename = "tailored-cv.docx",
): Promise<void> {
  if (typeof document === "undefined") return
  if (!(text ?? "").trim()) return
  const blob = await buildCvDocxBlob(text)
  triggerDownload(blob, filename)
}
