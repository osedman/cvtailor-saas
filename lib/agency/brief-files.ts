/**
 * The job description attached to a client brief (26 Sep 2026).
 *
 * The brief (search-briefs.ts) says HOW a search runs; the file here says
 * WHAT is being searched for. Either side attaches it; the version's config
 * carries the file's id (config.jdFileId), so replacing the file is an
 * amendment both sides sign again through the machinery that already
 * exists. Uploading never changes a version by itself — the route returns
 * an id and the caller puts it into the config it PATCHes.
 *
 * THE ROW IS THE POINTER THAT MAKES THE BLOB ERASABLE. Nothing reaches a
 * file in the bucket except through `search_brief_files.storage_path`, so
 * a blob whose row was never written is a file no erasure, purge or discard
 * can find. storeBriefJd() uploads and inserts IN THE SAME FUNCTION, and
 * removes the blob at once when the insert fails. This is the CV pointer
 * lesson of 19 Sep 2026 (lib/agency/ingest.ts) applied before, not after,
 * the orphans accumulate.
 *
 * WHO SEES IT: the recruiter (agency scope) and the client (contact scope).
 * Never a candidate, a referee, or a token doorway — a guardrail test fails
 * the build if any of those routes imports this module.
 */

import { createHash, randomUUID } from "crypto"
import { agencyAdmin, writeAudit, AgencyAccessError } from "./db"
import type { BriefSide } from "./brief-options"

export const BRIEF_BUCKET = "agency-briefs"
export const BRIEF_JD_LIMIT_BYTES = 10 * 1024 * 1024
export const BRIEF_JD_TEXT_CAP = 20000
/** Files one brief may hold, replacements included. Uploading never changes
 *  a version, so nothing else would ever notice a loop of 10 MB uploads —
 *  this ceiling does, and the route's rate limit slows it before that. */
export const BRIEF_JD_MAX_FILES = 20

/** Extension → the content type the bucket accepts. The bucket enforces
 *  this list too (allowed_mime_types); the route enforces it first so the
 *  refusal is a sentence, not a storage error. */
export const BRIEF_JD_TYPES: Record<"pdf" | "docx" | "txt", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
}

export interface BriefJdFile {
  fileId: string
  name: string
  sizeBytes: number
  contentType: string
  uploadedBySide: BriefSide
  createdAt: string
}

interface FileRow {
  id: string
  name: string
  size_bytes: number
  content_type: string
  uploaded_by_side: BriefSide
  created_at: string
}

const toFile = (r: FileRow): BriefJdFile => ({
  fileId: r.id,
  name: r.name,
  sizeBytes: Number(r.size_bytes),
  contentType: r.content_type,
  uploadedBySide: r.uploaded_by_side,
  createdAt: r.created_at,
})

/** The pointer columns, never `text`. List paths read this and nothing more. */
const POINTER_COLUMNS = "id, name, size_bytes, content_type, uploaded_by_side, created_at"

/**
 * Is this something the brief accepts? Decided by the extension, because
 * browsers disagree about the declared type of a .docx and send "" or
 * application/octet-stream often enough that trusting it refuses real files.
 * Returns the canonical content type, or null when the file is refused.
 */
export function briefJdContentType(name: string, declared: string): string | null {
  const parts = name.split(".")
  if (parts.length < 2) return null
  const ext = parts.pop()!.toLowerCase()
  // An OWN property only: `in` would let "jd.constructor" through as a type
  // inherited from Object.prototype, and a function is not a MIME type.
  const canonical = Object.prototype.hasOwnProperty.call(BRIEF_JD_TYPES, ext) ? BRIEF_JD_TYPES[ext as keyof typeof BRIEF_JD_TYPES] : null
  if (typeof canonical !== "string") return null
  const d = (declared || "").split(";")[0].trim().toLowerCase()
  if (d && d !== "application/octet-stream" && d !== canonical) return null
  return canonical
}

export interface StoreBriefJdInput {
  ctx: { side: BriefSide; agencyId: string; userId: string }
  briefId: string
  file: { buffer: Buffer; name: string; contentType: string }
}

/**
 * Upload the bytes, extract the text, write the pointer — one function, in
 * that order, and the blob is removed the moment the pointer cannot be
 * written. The caller has already checked that the brief is theirs and
 * live; this function checks the file and keeps the storage promise.
 */
export async function storeBriefJd(input: StoreBriefJdInput): Promise<BriefJdFile> {
  const { ctx, briefId, file } = input
  if (file.buffer.length === 0) throw new Error("that file is empty")
  if (file.buffer.length > BRIEF_JD_LIMIT_BYTES) throw new Error("File too large (max 10 MB)")
  const contentType = briefJdContentType(file.name, file.contentType)
  if (!contentType) throw new Error("Upload a PDF, DOCX, or TXT file.")

  const admin = agencyAdmin()

  // The ceiling, counted before a byte is stored. The route's rate limit
  // slows a loop; this stops it. Replacements count: a brief that has been
  // through twenty files is one somebody should look at.
  const { count, error: countError } = await admin.from("search_brief_files").select("id", { count: "exact", head: true }).eq("brief_id", briefId).is("deleted_at", null)
  if (countError) throw countError
  if ((count ?? 0) >= BRIEF_JD_MAX_FILES) throw new AgencyAccessError(`this brief already has ${BRIEF_JD_MAX_FILES} files`)

  const fileId = randomUUID()
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "job-description"
  const path = `${ctx.agencyId}/${briefId}/${fileId}/${safeName}`
  const sha256 = createHash("sha256").update(file.buffer).digest("hex")

  // Text first, before anything is stored: a file the extractor cannot read
  // is still a file the client can open, so extraction failing is logged and
  // the attachment goes ahead with no text — connect then copies nothing.
  let text = ""
  try {
    const { extractFileText } = await import("@/lib/extract-file-text")
    const asFile = new File([new Uint8Array(file.buffer)], file.name, { type: contentType })
    text = (await extractFileText(asFile)).trim().slice(0, BRIEF_JD_TEXT_CAP)
  } catch (e) {
    console.error("[brief-files] could not extract text from the job description:", e instanceof Error ? e.message : e)
  }

  const { error: uploadError } = await admin.storage.from(BRIEF_BUCKET).upload(path, file.buffer, { contentType })
  if (uploadError) throw uploadError

  const { data: row, error: pointerError } = await admin
    .from("search_brief_files")
    .insert({
      id: fileId,
      agency_id: ctx.agencyId,
      brief_id: briefId,
      storage_path: path,
      name: file.name.slice(0, 200),
      content_type: contentType,
      size_bytes: file.buffer.length,
      sha256,
      text,
      text_chars: text.length,
      uploaded_by_side: ctx.side,
      uploaded_by: ctx.userId,
    })
    .select(POINTER_COLUMNS)
    .single()

  if (pointerError || !row) {
    // The blob is now unreachable by every path there is. Remove it, and if
    // that fails too, say so in the words somebody will search for.
    console.error("[brief-files] could not record the pointer; removing the orphan:", pointerError?.message)
    const { error: cleanupError } = await admin.storage.from(BRIEF_BUCKET).remove([path])
    if (cleanupError) {
      console.error("[brief-files] ORPHANED JD — pointer unwritten and blob not removed:", path, cleanupError.message)
    }
    throw pointerError ?? new Error("could not record the job description")
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    actorId: ctx.userId,
    entityType: "brief",
    entityRef: briefId,
    action: "brief_jd_attached",
    toValue: { file_id: fileId, name: file.name.slice(0, 200), size: file.buffer.length, side: ctx.side },
  })

  return toFile(row as FileRow)
}

/**
 * The pointer rows for the given ids on ONE brief — one select, never the
 * text column. loadBrief() resolves latest.jd and previous.jd through this.
 */
export async function listBriefJdFiles(briefId: string, fileIds: string[]): Promise<Map<string, BriefJdFile>> {
  const ids = Array.from(new Set(fileIds.filter(Boolean)))
  const out = new Map<string, BriefJdFile>()
  if (ids.length === 0) return out
  const admin = agencyAdmin()
  const { data, error } = await admin.from("search_brief_files").select(POINTER_COLUMNS).eq("brief_id", briefId).in("id", ids).is("deleted_at", null)
  if (error) throw error
  for (const r of (data ?? []) as FileRow[]) out.set(r.id, toFile(r))
  return out
}

/**
 * A config about to be written carries config.jdFileId; this is the check
 * that the id is a live file ON THIS BRIEF. normaliseBrief only knows it is
 * uuid-shaped, and a version both sides sign must not describe a file that
 * is not there (or is on another brief). Throws AgencyAccessError so the
 * routes answer 400, as for any other refused amendment.
 */
export async function assertJdOnBrief(briefId: string, fileId: string | null): Promise<void> {
  if (!fileId) return
  const found = await listBriefJdFiles(briefId, [fileId])
  if (!found.has(fileId)) throw new AgencyAccessError("that job description is not on this brief — attach it again")
}

/** The extracted text of one file on one brief, for connect. Empty when
 *  the file is not on that brief or nothing could be extracted. */
export async function getBriefJdText(briefId: string, fileId: string): Promise<{ name: string; text: string } | null> {
  const admin = agencyAdmin()
  const { data, error } = await admin.from("search_brief_files").select("name, text").eq("brief_id", briefId).eq("id", fileId).is("deleted_at", null).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { name: data.name as string, text: (data.text as string) ?? "" }
}

/**
 * The row and the bytes, for a download route that has ALREADY scoped the
 * brief to its caller (agency for the recruiter, contact for the client).
 * Null when the file is not on that brief — the route answers 404.
 */
export async function readBriefJd(briefId: string, fileId: string): Promise<{ file: BriefJdFile; blob: Blob } | null> {
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("search_brief_files")
    .select(`${POINTER_COLUMNS}, storage_path`)
    .eq("brief_id", briefId)
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: blob, error: dlError } = await admin.storage.from(BRIEF_BUCKET).download(data.storage_path as string)
  if (dlError) throw dlError
  if (!blob) return null
  return { file: toFile(data as FileRow), blob }
}

/**
 * The headers a download route sends: the stored type, and the file as an
 * attachment under its own name — ASCII-safe in the plain parameter, RFC 5987
 * beside it for the rest — never inline, so a PDF cannot run in the app's
 * origin. No caching: the URL is behind a session and a scope check.
 */
export function attachmentHeaders(file: BriefJdFile): Record<string, string> {
  const name = file.name.slice(0, 120) || "job-description"
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_")
  return {
    "Content-Type": file.contentType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }
}

/**
 * Every file on a brief: blobs first, then rows. Used by discardDraft —
 * drafts only, as today; a sent brief is a record and keeps its files.
 * A blob that will not go keeps its row, because the row is the only thing
 * that can ever find it again.
 */
export async function deleteBriefJdFiles(briefId: string): Promise<void> {
  const admin = agencyAdmin()
  const { data, error } = await admin.from("search_brief_files").select("id, storage_path").eq("brief_id", briefId)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; storage_path: string }>
  if (rows.length === 0) return
  const { data: removed, error: rmError } = await admin.storage.from(BRIEF_BUCKET).remove(rows.map((r) => r.storage_path))
  if (rmError) {
    console.error("[brief-files] could not remove the brief's files; rows kept so they stay reachable:", rmError.message)
    return
  }
  const gone = new Set((removed ?? []).map((o) => o.name))
  const ids = rows.filter((r) => gone.has(r.storage_path)).map((r) => r.id)
  if (ids.length === 0) return
  const { error: delError } = await admin.from("search_brief_files").delete().in("id", ids)
  if (delError) throw delError
}
