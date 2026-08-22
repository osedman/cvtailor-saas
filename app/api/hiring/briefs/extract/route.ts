/**
 * Turn an uploaded job description into text for the brief form.
 *
 * Most JDs live as a .docx in somebody's drive, and until now the one person
 * holding that file — the hiring manager — was the only one who could not
 * upload it. A recruiter has had three ways to supply a JD since intake was
 * built (paste, upload, link); this closes the gap at the other end.
 *
 * THE FILE IS NEVER STORED. It is read in memory, converted to text, and
 * dropped. Only the text goes back to the browser, where it fills the textarea
 * the hiring manager can still see and edit — so what is submitted is always
 * what they had a chance to correct. That also means no bucket, no retention
 * question, and nothing extra to delete when the role closes.
 *
 * Open to any linked hiring manager: this reads a document they already have
 * and writes nothing.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError } from "@/lib/agency/db"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { extractFileText } from "@/lib/agency/ingest"
import { MAX_JD } from "@/lib/agency/brief-limits"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) {
      return NextResponse.json(
        {
          error:
            auth.failure === "unauthenticated"
              ? "Unauthorised"
              : "No client access — ask your recruiter for an invite.",
        },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Send the file as form data" }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was attached" }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty" }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large — 10 MB maximum" }, { status: 400 })
    }

    const text = (await extractFileText(file)).replace(/\r/g, "").replace(/\n{4,}/g, "\n\n").trim()

    if (!text) {
      // A scanned PDF with no text layer is the common case here, and saying
      // so is more use than "could not read the file".
      return NextResponse.json(
        { error: "No text found in that file. If it is a scan, paste the text instead." },
        { status: 400 }
      )
    }

    // Capped to the same limit the brief itself stores, so the box never holds
    // more than will survive the save.
    const capped = text.slice(0, MAX_JD)

    return NextResponse.json({
      text: capped,
      truncated: capped.length < text.length,
      characters: capped.length,
    })
  } catch (e) {
    if (e instanceof AgencyAccessError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 })
  }
}
