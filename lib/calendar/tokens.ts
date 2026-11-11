/**
 * Calendar tokens at rest.
 *
 * A refresh token is a standing key to someone's diary, so it is never
 * stored in the clear: AES-256-GCM under CALENDAR_TOKEN_KEY (32 bytes,
 * base64), with a fresh IV per value and the tag alongside. No key, no
 * connecting — the connect route refuses with a clear message rather than
 * falling back to plaintext, which is the failure that would be silent.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function key(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_KEY ?? ""
  const buf = Buffer.from(raw, "base64")
  if (buf.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes, base64-encoded")
  return buf
}

/** True when tokens can be stored; the UI shows "not configured" otherwise. */
export function tokenStorageConfigured(): boolean {
  try {
    key()
    return true
  } catch {
    return false
  }
}

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".")
}

export function open(sealed: string): string {
  const [iv, tag, enc] = sealed.split(".")
  if (!iv || !tag || !enc) throw new Error("sealed token is malformed")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8")
}
