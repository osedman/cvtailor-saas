"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, X } from "lucide-react"
import { bandClaim, DEFAULT_SHARE_SETTINGS, type ClaimRedaction, type ShareSettings } from "@/lib/career-arc-share"
import type { EvidenceRow } from "@/lib/career-arc-ledger"

const ACCENT = "#dc4f33"
const INK = "#1e1813"
const SAND = "#e0d6c9"
const SAND_LT = "#ece2d6"
const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1"

interface ShareState {
  token: string
  settings: ShareSettings
  expiresAt: string | null
  revoked: boolean
  viewCount: number
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch {
    throw new Error(`Unexpected response (${res.status}).`)
  }
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Server error ${res.status}.`)
  return data as T
}

function stripMarkers(banded: string): string {
  return banded.replace(/⟪([^⟫]*)⟫/g, "$1")
}

function GroupHead({ label, note }: { label: string; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: INK }}>{label}</h2>
      {note && <span className="ml-auto text-[11.5px] text-[#a89e93]">{note}</span>}
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${FOCUS_RING}`}
      style={{ background: on ? ACCENT : SAND }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  )
}

export function ShareModal({ evidence, onClose }: { evidence: EvidenceRow[]; onClose: () => void }) {
  const [share, setShare] = useState<ShareState | null>(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ShareSettings>(DEFAULT_SHARE_SETTINGS)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const cards = useMemo(
    () => evidence.filter((e) => !e.hidden).sort((a, b) => a.sort_order - b.sort_order),
    [evidence],
  )

  useEffect(() => {
    ;(async () => {
      try {
        const got = await readJson<{ share: ShareState | null }>(await fetch("/api/career-arc-share"))
        const state = got.share ?? (await readJson<{ share: ShareState }>(
          await fetch("/api/career-arc-share", { method: "POST" }),
        )).share
        setShare(state)
        setSettings(state.settings)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't load your share link.")
        onClose()
      } finally {
        setLoading(false)
      }
    })()
  }, [onClose])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const data = await readJson<{ share: ShareState }>(
        await fetch("/api/career-arc-share", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      )
      setShare(data.share)
      setSettings(data.share.settings)
      setDirty(false)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't save.")
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const setRedaction = (id: string, r: ClaimRedaction) => {
    setSettings((s) => ({ ...s, claimRedactions: { ...s.claimRedactions, [id]: r } }))
    setDirty(true)
  }
  const flip = (flag: "firstNameOnly" | "hideEmployers" | "hideDates" | "includeBreak") => {
    setSettings((s) => ({ ...s, [flag]: !s[flag] }))
    setDirty(true)
  }

  const link = share ? `${window.location.origin}/arc/${share.token}` : ""

  const copyLink = async () => {
    if (dirty) {
      const ok = await patch({ action: "settings", settings })
      if (!ok) return
    }
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied — your redactions are applied.")
    } catch {
      toast.error("Couldn't copy — select the link text instead.")
    }
  }

  const expiryLabel = share?.expiresAt
    ? `Link expires ${new Date(share.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "Link never expires"

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8"
      style={{ background: "rgba(30,24,19,0.6)", backdropFilter: "blur(4px)", overscrollBehavior: "contain" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your arc"
        className="w-full max-w-2xl rounded-[24px] p-6 shadow-[0_24px_64px_rgba(30,24,19,0.45)] sm:p-8"
        style={{ background: "#fdfcf9" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black" style={{ color: INK }}>
              Share your arc<span style={{ color: ACCENT }}>.</span>
            </h1>
            <p className="mt-1 text-[13px] text-[#8a8178]">
              Nothing is shared until you send the link — and you choose what each claim shows, claim by claim.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className={`rounded-lg p-1.5 text-[#8a8178] transition-colors hover:text-[#1e1813] ${FOCUS_RING}`}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading || !share ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <GroupHead label="PER-CLAIM REDACTION" note="for each number, you choose" />
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1" style={{ overscrollBehavior: "contain" }}>
                {cards.map((card) => {
                  const current = settings.claimRedactions[card.id] ?? "full"
                  const text = card.rephrased_text ?? card.claim
                  return (
                    <div key={card.id} className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: SAND_LT }}>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: current === "hide" ? "#a89e93" : INK }}>
                          {text}
                        </p>
                        <div className="flex gap-1" role="radiogroup" aria-label="Redaction level">
                          {(["full", "band", "hide"] as const).map((r) => (
                            <button
                              key={r}
                              role="radio"
                              aria-checked={current === r}
                              onClick={() => setRedaction(card.id, r)}
                              className={`rounded-md border px-2.5 py-1 font-mono text-[9.5px] tracking-[0.1em] transition-colors ${FOCUS_RING}`}
                              style={current === r
                                ? { background: INK, borderColor: INK, color: "#f9f6f0" }
                                : { background: "#f9f6f0", borderColor: SAND, color: "#55504a" }}
                            >
                              {r.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      {current === "band" && (
                        <p className="mt-1.5 text-[11.5px] text-[#a89e93]">
                          will show as → <em className="font-semibold not-italic" style={{ color: ACCENT }}>{stripMarkers(bandClaim(text))}</em>
                        </p>
                      )}
                    </div>
                  )
                })}
                {cards.length === 0 && <p className="text-[12.5px] text-[#a89e93]">No visible cards to share yet.</p>}
              </div>
            </div>

            <div className="mt-6">
              <GroupHead label="IDENTITY" note="applies across the whole page" />
              <div className="space-y-2">
                {([
                  ["firstNameOnly", "First name only", "your surname stays private"],
                  ["hideEmployers", "Hide employer names", "roles stay; company names disappear"],
                  ["hideDates", "Hide dates", "tenure stays; individual years disappear"],
                  ["includeBreak", "Include career break", "off by default — recipients see chapters, not gaps"],
                ] as const).map(([flag, label, sub]) => (
                  <div key={flag} className="flex items-center gap-4 rounded-xl border bg-white px-4 py-3" style={{ borderColor: SAND_LT }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold" style={{ color: INK }}>{label}</p>
                      <p className="text-[11.5px] text-[#a89e93]">{sub}</p>
                    </div>
                    <Toggle on={settings[flag]} onClick={() => flip(flag)} label={label} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <GroupHead label="SHARE LINK" note={`revocable at any time · viewed ${share.viewCount} time${share.viewCount === 1 ? "" : "s"}`} />
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border bg-white px-3 py-2 font-mono text-[11.5px] text-[#55504a]" style={{ borderColor: SAND }}>
                  {link}
                </code>
                <button
                  onClick={copyLink}
                  disabled={busy || share.revoked}
                  className={`rounded-[10px] px-4 py-2 text-[12.5px] font-semibold text-white transition-all hover:brightness-105 disabled:opacity-50 ${FOCUS_RING}`}
                  style={{ background: ACCENT }}
                >
                  Copy link
                </button>
                <button
                  onClick={() => patch({ action: share.revoked ? "unrevoke" : "revoke" }).then((ok) => {
                    if (ok) toast.success(share.revoked ? "Link re-enabled." : "Link revoked — the URL now returns 404.")
                  })}
                  disabled={busy}
                  className={`rounded-[10px] border bg-white px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-[#dc4f33] disabled:opacity-50 ${FOCUS_RING}`}
                  style={{ borderColor: SAND, color: INK }}
                >
                  {share.revoked ? "Re-enable" : "Revoke"}
                </button>
              </div>
              {share.revoked && (
                <p className="mt-2 text-[12px] font-semibold" style={{ color: ACCENT }}>
                  This link is revoked — visitors see a 404 until you re-enable it.
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-[#8a8178]">{expiryLabel}</span>
                <div className="flex gap-1">
                  {([["7 days", 7], ["30 days", 30], ["Never", null]] as const).map(([label, days]) => (
                    <button
                      key={label}
                      onClick={() => patch({ action: "expiry", days })}
                      disabled={busy}
                      className={`rounded-md border px-2.5 py-1 font-mono text-[9.5px] tracking-[0.1em] text-[#55504a] transition-colors hover:border-[#dc4f33] disabled:opacity-50 ${FOCUS_RING}`}
                      style={{ background: "#f9f6f0", borderColor: SAND }}
                    >
                      {label.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => patch({ action: "regenerate" }).then((ok) => {
                    if (ok) toast.success("New link generated — the old URL is dead.")
                  })}
                  disabled={busy}
                  className={`ml-auto rounded-md border px-2.5 py-1 font-mono text-[9.5px] tracking-[0.1em] text-[#55504a] transition-colors hover:border-[#dc4f33] disabled:opacity-50 ${FOCUS_RING}`}
                  style={{ background: "#f9f6f0", borderColor: SAND }}
                >
                  NEW LINK
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 border-t pt-4" style={{ borderColor: SAND_LT }}>
              <button
                onClick={() => patch({ action: "settings", settings }).then((ok) => { if (ok) toast.success("Share choices saved.") })}
                disabled={busy || !dirty}
                className={`rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white transition-all hover:brightness-105 disabled:opacity-40 ${FOCUS_RING}`}
                style={{ background: dirty ? ACCENT : "#a89e93" }}
              >
                {busy ? "Saving…" : dirty ? "Save choices" : "Saved"}
              </button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-[12.5px] font-medium text-[#8a8178] underline-offset-2 hover:underline ${FOCUS_RING} rounded`}
              >
                Open public view ↗
              </a>
              {dirty && <span className="ml-auto text-[11.5px] text-[#a89e93]">unsaved changes</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
