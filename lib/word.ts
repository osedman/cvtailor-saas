/**
 * Download plain-text CV content as a Word document (.doc), rendered in the
 * "Modern Clean CV" template style:
 *   - Calibri throughout
 *   - Name: 22pt bold, slate blue #2E5266
 *   - Contact/headline block: grey #595959, separated by a slate rule
 *   - Section headings: bold #2E5266 small caps with a thin bottom rule
 *   - Role lines: bold; company lines: italic grey; body/bullets: dark grey
 *
 * Word opens HTML wrapped in a .doc container natively — no library needed.
 */

const ACCENT = "#2E5266"
const GREY = "#595959"
const BODY = "#3b3b3b"

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const isSectionHeading = (t: string) => /^[A-Z][A-Z\s&/,'()-]+$/.test(t) && t.length >= 3
const isBullet = (t: string) => /^[•\-\*·]/.test(t)
// A role/employer line: contains a 4-digit year or "Present", reasonably short
const isRoleLine = (t: string) => (/\b(19|20)\d{2}\b|Present/i.test(t)) && t.length < 130

/** Build the full Word-compatible HTML document for a plain-text CV */
export function buildCvHtml(text: string): string {
  const lines = (text ?? "").split("\n")

  // Header block = everything before the first section heading. Line 0 is
  // always the candidate's name (often ALL CAPS too), so search from line 1.
  let firstSection = lines.findIndex(
    (l, i) => i > 0 && isSectionHeading(l.trim()) && l.trim().length > 0
  )
  if (firstSection === -1) firstSection = 0

  const out: string[] = []
  let headerClosed = firstSection === 0

  lines.forEach((line, idx) => {
    const t = line.trim()

    // ── Header block ──
    if (!headerClosed && idx < firstSection) {
      if (idx === 0 && t) {
        out.push(`<p style="font-size:22pt;font-weight:bold;color:${ACCENT};letter-spacing:0.5pt;margin:0 0 2pt 0">${esc(t)}</p>`)
      } else if (t) {
        out.push(`<p style="font-size:10.5pt;color:${GREY};margin:0 0 3pt 0">${esc(t)}</p>`)
      }
      // Close the header with the slate rule just before the first section
      if (idx === firstSection - 1) {
        out.push(`<p style="border-bottom:1.5pt solid ${ACCENT};font-size:1pt;margin:4pt 0 10pt 0">&nbsp;</p>`)
        headerClosed = true
      }
      return
    }

    if (!t) { out.push(`<p style="font-size:4pt;margin:0">&nbsp;</p>`); return }

    if (isSectionHeading(t)) {
      const pretty = t.charAt(0) + t.slice(1).toLowerCase()
      out.push(
        `<p style="font-size:11.5pt;font-weight:bold;color:${ACCENT};text-transform:uppercase;letter-spacing:0.8pt;border-bottom:1pt solid ${ACCENT};padding-bottom:2pt;margin:14pt 0 6pt 0">${esc(pretty)}</p>`
      )
      return
    }

    if (isBullet(t)) {
      out.push(
        `<p style="font-size:10.5pt;color:${BODY};margin:0 0 3pt 14pt;text-indent:-9pt">•&nbsp;&nbsp;${esc(t.replace(/^[•\-\*·]\s*/, ""))}</p>`
      )
      return
    }

    if (isRoleLine(t)) {
      out.push(`<p style="font-size:11pt;font-weight:bold;color:#1a1a1a;margin:7pt 0 1pt 0">${esc(t)}</p>`)
      return
    }

    // Company/location style lines: shortish, directly under a role line
    const prev = lines[idx - 1]?.trim() ?? ""
    if (t.length < 90 && isRoleLine(prev)) {
      out.push(`<p style="font-size:10.5pt;font-style:italic;color:${GREY};margin:0 0 4pt 0">${esc(t)}</p>`)
      return
    }

    out.push(`<p style="font-size:10.5pt;color:${BODY};margin:0 0 4pt 0;line-height:1.35">${esc(t)}</p>`)
  })

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8"><title>CV</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm 2.2cm; }
  body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: ${BODY}; }
</style>
</head>
<body>${out.join("\n")}
<p style="margin:22pt 0 0 0;border-top:0.75pt solid #d8d4cd;padding-top:6pt;text-align:center;font-size:8pt;color:#a8a29e;letter-spacing:0.4pt;">Made with Tailr &middot; gettailr.vercel.app</p>
</body></html>`
}

export function downloadWordDoc(text: string, filename = "tailored-cv.doc") {
  const blob = new Blob(["﻿" + buildCvHtml(text)], { type: "application/msword" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
