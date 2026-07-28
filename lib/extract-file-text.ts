/** In-memory text extraction for user uploads (PDF/DOCX/TXT). Files are read
 * and discarded — never stored. Shared by first-cv extract and skill-evidence
 * review. */
export async function extractFileText(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("File too large (maximum 10 MB).")
  const ext = file.name.split(".").pop()?.toLowerCase()
  const buffer = Buffer.from(await file.arrayBuffer())
  if (ext === "txt") return buffer.toString("utf-8")
  if (ext === "docx") {
    const mammoth = await import("mammoth")
    return (await mammoth.extractRawText({ buffer })).value
  }
  if (ext === "pdf") {
    await import("@/lib/pdf-node-polyfill")
    const { extractText: readPdf, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await readPdf(pdf, { mergePages: true })
    return Array.isArray(text) ? text.join("\n\n") : text
  }
  throw new Error("Upload a PDF, DOCX, or TXT file.")
}
