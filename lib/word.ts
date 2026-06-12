/**
 * Download plain-text CV content as a Word document (.doc).
 * Word opens HTML wrapped in a .doc container natively — no library needed.
 */
export function downloadWordDoc(text: string, filename = "tailored-cv.doc") {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const lines = (text ?? "").split("\n")
  const body = lines
    .map((line) => {
      const t = line.trim()
      if (!t) return "<p>&nbsp;</p>"
      const isHeading = /^[A-Z][A-Z\s&/,]+$/.test(t)
      if (isHeading) return `<p style="font-weight:bold;font-size:13pt;margin:14pt 0 4pt">${esc(t)}</p>`
      if (/^[•\-\*·]/.test(t)) return `<p style="margin:0 0 0 18pt">• ${esc(t.replace(/^[•\-\*·]\s*/, ""))}</p>`
      return `<p style="margin:2pt 0">${esc(t)}</p>`
    })
    .join("\n")
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Tailored CV</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4">${body}</body></html>`
  const blob = new Blob(["﻿" + html], { type: "application/msword" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
