-- ============================================================
-- Migration 21 · The agency-recordings bucket
-- ============================================================
-- The store for interview audio, between upload and the moment the
-- transcript is verified — at which point the cron sweep deletes the blob
-- and stamps recording_deleted_at. Recordings are SHORT-LIVED BY DESIGN:
-- "the audio is deleted as soon as the transcript is checked"
-- (docs/CONSENT-COPY-DRAFT.md §2) is a promise in writing, and this bucket
-- is the thing that promise is about.
--
-- NOTHING HERE MAY POINT AT A REAL CANDIDATE until the lawyer has read
-- CONSENT-COPY-DRAFT §2/§3 and the DPIA is done. The bucket exists so the
-- path can be built and drilled against synthetic audio first.
--
-- PRIVATE, AND NO POLICIES ON PURPOSE.
-- storage.objects has RLS on, so with zero policies the `authenticated` role
-- can do nothing here at all — no read, no write, no list. Every byte moves
-- through a service-role signed URL minted by a route that has already
-- checked membership, writer role, and capture consent. This is the
-- audit-coupling rule applied to a blob: if the UI can reach it directly,
-- the check can be skipped.
--
-- AUDIO ONLY, DELIBERATELY.
-- Conference tools export video, and video of a candidate's face is a
-- materially larger privacy footprint than their voice — for a feature whose
-- entire argument is "verbatim quotes mapped to requirements, no inference
-- about the person", holding faces we never look at is indefensible. A
-- recruiter with an mp4 extracts the audio. The friction is the point.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agency-recordings',
  'agency-recordings',
  false,
  -- 90 minutes of 256kbps audio, with room. Interviews run long.
  209715200,
  array[
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/flac'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
