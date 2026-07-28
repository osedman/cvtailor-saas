"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Download, FileText, Loader2, PencilLine, Plus, ShieldCheck, Sparkles, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import { downloadWordDoc } from "@/lib/word"
import { EVIDENCE_CATEGORIES, type CvEvidenceItem, type EvidenceCategory, type FirstCvDraft } from "@/lib/first-cv"

const LABELS: Record<EvidenceCategory, string> = {
  education: "Education", project: "Project or portfolio", work: "Work experience",
  volunteering: "Volunteering", responsibility: "Responsibility", award: "Award",
  certificate: "Certificate", skill: "Skill", activity: "Club or activity", other: "Other experience",
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: { error?: string } & T
  try { data = JSON.parse(text) } catch { throw new Error(`Unexpected server response (${res.status}).`) }
  if (!res.ok) throw new Error(data.error || "Something went wrong.")
  return data
}

export default function FirstCvPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [evidence, setEvidence] = useState<CvEvidenceItem[]>([])
  const [cv, setCv] = useState<FirstCvDraft | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [target, setTarget] = useState("")
  const [contact, setContact] = useState("")
  const [form, setForm] = useState({ category: "project" as EvidenceCategory, title: "", organisation: "", dateText: "", description: "", skills: "" })

  useEffect(() => { if (!authLoading && !user) router.push("/tailor") }, [authLoading, user, router])

  const load = useCallback(async () => {
    try {
      const data = await json<{ evidence: CvEvidenceItem[]; cv: FirstCvDraft | null }>(await fetch("/api/first-cv"))
      setEvidence(data.evidence); setCv(data.cv); setTarget(data.cv?.target_opportunity ?? "")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load your CV workspace.") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  async function addEvidence() {
    try {
      const data = await json<{ evidence: CvEvidenceItem }>(await fetch("/api/first-cv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "add-evidence", ...form, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean) }),
      }))
      setEvidence((old) => [data.evidence, ...old]); setShowForm(false)
      setForm({ category: "project", title: "", organisation: "", dateText: "", description: "", skills: "" })
      toast.success("Experience added and confirmed.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add that experience.") }
  }

  async function updateStatus(item: CvEvidenceItem, reviewStatus: CvEvidenceItem["review_status"]) {
    const previous = evidence
    setEvidence((old) => old.map((row) => row.id === item.id ? { ...row, review_status: reviewStatus } : row))
    try {
      const data = await json<{ evidence: CvEvidenceItem }>(await fetch("/api/first-cv", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, reviewStatus }),
      }))
      setEvidence((old) => old.map((row) => row.id === item.id ? data.evidence : row))
    } catch (error) { setEvidence(previous); toast.error(error instanceof Error ? error.message : "Could not update that item.") }
  }

  async function upload(file: File) {
    setUploading(true)
    try {
      const body = new FormData(); body.append("file", file)
      const data = await json<{ evidence: CvEvidenceItem[] }>(await fetch("/api/first-cv/extract", { method: "POST", body }))
      setEvidence((old) => [...data.evidence, ...old])
      toast.success(`Found ${data.evidence.length} thing${data.evidence.length === 1 ? "" : "s"} for you to review. The file was not stored.`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read that file.") }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  async function generate() {
    setGenerating(true)
    try {
      const data = await json<{ cv: FirstCvDraft }>(await fetch("/api/first-cv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate", targetOpportunity: target, contact }),
      }))
      setCv(data.cv); toast.success("Your first CV is ready to review.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not build your CV.") }
    finally { setGenerating(false) }
  }

  async function save() {
    if (!cv) return
    setSaving(true)
    try {
      const data = await json<{ cv: FirstCvDraft }>(await fetch("/api/first-cv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "save", cvText: cv.cv_text, targetOpportunity: target }),
      }))
      setCv(data.cv); toast.success("CV saved.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save your CV.") }
    finally { setSaving(false) }
  }

  function useForApplication() {
    if (!cv) return
    try {
      localStorage.setItem("cvtailor:cv", cv.cv_text)
      localStorage.setItem("cvtailor:cv-filename", "My first CV")
    } catch {}
    router.push("/tailor")
  }

  if (authLoading || !user || loading) return <div className="min-h-screen grid place-items-center bg-[#f9f6f0]"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  const confirmed = evidence.filter((item) => item.review_status === "confirmed")
  const suggested = evidence.filter((item) => item.review_status === "suggested")

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <Header enhanced />
      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <Link href="/career-path" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1e1813]"><ArrowLeft className="w-4 h-4" />Career Path</Link>
        <div className="mt-5 grid lg:grid-cols-[0.92fr_1.08fr] gap-6 items-start">
          <section>
            <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-[#dc4f33]">First CV builder</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1e1813]">Your experience counts.</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600 max-w-xl">Add school projects, portfolio work, certificates, volunteering, clubs, caring responsibilities, informal work or paid jobs. You review every fact before it reaches your CV.</p>

            <div className="mt-6 rounded-2xl bg-white border border-[#ece6da] p-5">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-bold text-[#1e1813]">1. Add your evidence</h2><p className="mt-1 text-xs text-gray-500">PDF, DOCX or TXT, maximum 10 MB. Files are read and discarded.</p></div>
                <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
              </div>
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-xl border border-dashed border-[#dac9bf] bg-[#fffaf8] p-4 text-left hover:border-[#dc4f33] transition-colors disabled:opacity-60">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin text-[#dc4f33]" /> : <Upload className="w-5 h-5 text-[#dc4f33]" />}
                  <span className="mt-2 block text-sm font-semibold text-[#1e1813]">{uploading ? "Reading your file…" : "Upload a document"}</span>
                  <span className="text-xs text-gray-500">Certificate, project, portfolio or notes</span>
                </button>
                <button onClick={() => setShowForm(true)} className="rounded-xl border border-[#ece6da] bg-white p-4 text-left hover:border-[#dc4f33] transition-colors">
                  <PencilLine className="w-5 h-5 text-[#dc4f33]" /><span className="mt-2 block text-sm font-semibold text-[#1e1813]">Tell us yourself</span><span className="text-xs text-gray-500">No document needed</span>
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file) }} />
            </div>

            {showForm && <div className="mt-4 rounded-2xl bg-white border border-[#ece6da] p-5">
              <div className="flex items-center justify-between"><h2 className="font-bold text-[#1e1813]">Add an experience</h2><button onClick={() => setShowForm(false)} aria-label="Close"><X className="w-4 h-4 text-gray-400" /></button></div>
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">Type<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EvidenceCategory })} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-[#1e1813] bg-white">{EVIDENCE_CATEGORIES.map((category) => <option key={category} value={category}>{LABELS[category]}</option>)}</select></label>
                <label className="text-xs text-gray-500">Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Business challenge project" className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-[#1e1813]" /></label>
                <label className="text-xs text-gray-500">School or organisation <span className="text-gray-300">optional</span><input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-[#1e1813]" /></label>
                <label className="text-xs text-gray-500">When <span className="text-gray-300">optional</span><input value={form.dateText} onChange={(e) => setForm({ ...form, dateText: e.target.value })} placeholder="e.g. March 2026" className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-[#1e1813]" /></label>
              </div>
              <label className="mt-3 block text-xs text-gray-500">What did you do?<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe your part, what you made or helped with, and what happened." className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-[#1e1813] resize-y" /></label>
              <label className="mt-3 block text-xs text-gray-500">Skills used <span className="text-gray-300">optional, separated by commas</span><input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Teamwork, Excel, presenting" className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-[#1e1813]" /></label>
              <button onClick={addEvidence} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#dc4f33] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="w-4 h-4" />Add experience</button>
            </div>}

            <div className="mt-6 rounded-2xl bg-white border border-[#ece6da] p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-bold text-[#1e1813]">2. Review what counts</h2><p className="mt-1 text-xs text-gray-500">Only confirmed items can be used.</p></div><span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">{confirmed.length} confirmed</span></div>
              {evidence.length === 0 ? <div className="py-8 text-center"><FileText className="w-7 h-7 mx-auto text-gray-300" /><p className="mt-2 text-sm text-gray-500">Your evidence will appear here.</p></div> : <div className="mt-4 space-y-3">
                {evidence.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${item.review_status === "confirmed" ? "border-green-200 bg-green-50/30" : item.review_status === "excluded" ? "border-gray-100 opacity-55" : "border-amber-200 bg-amber-50/30"}`}>
                  <div className="flex gap-3 justify-between"><div><span className="text-[10px] uppercase tracking-wide font-bold text-gray-400">{LABELS[item.category]} · {item.source_name}</span><h3 className="mt-1 text-sm font-bold text-[#1e1813]">{item.title}</h3>{item.organisation && <p className="text-xs text-gray-500">{item.organisation}{item.date_text ? ` · ${item.date_text}` : ""}</p>}</div>{item.review_status === "confirmed" && <Check className="w-5 h-5 text-green-600 shrink-0" />}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{item.description}</p>
                  {item.source_excerpt && <p className="mt-2 text-[11px] text-gray-400 border-l-2 border-gray-200 pl-2">From file: “{item.source_excerpt}”</p>}
                  <div className="mt-3 flex gap-2">{item.review_status !== "confirmed" && <button onClick={() => updateStatus(item, "confirmed")} className="rounded-lg bg-[#1e1813] text-white px-3 py-1.5 text-xs font-semibold">Yes, use this</button>}{item.review_status !== "excluded" && <button onClick={() => updateStatus(item, "excluded")} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500">Leave out</button>}{item.review_status === "excluded" && <button onClick={() => updateStatus(item, "suggested")} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500">Review again</button>}</div>
                </article>)}
              </div>}
            </div>
          </section>

          <aside className="lg:sticky lg:top-20">
            <div className="rounded-2xl bg-[#1e1813] text-white p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-[#f4a58e]">3. Build your CV</p>
              <label className="mt-4 block text-xs text-[#b8afa6]">What are you applying for? <span className="text-[#746b63]">optional</span><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Digital marketing apprenticeship" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 p-3 text-sm text-white placeholder:text-[#746b63]" /></label>
              <label className="mt-3 block text-xs text-[#b8afa6]">Contact details for the CV <span className="text-[#746b63]">optional</span><textarea value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name, town/city, email and phone. Do not add your full street address." rows={3} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 p-3 text-sm text-white placeholder:text-[#746b63] resize-none" /></label>
              <button onClick={generate} disabled={generating || confirmed.length === 0 || suggested.length > 0} className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#dc4f33] px-4 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{generating ? "Building your CV…" : cv ? "Rebuild from confirmed evidence" : "Build my first CV"}
              </button>
              {suggested.length > 0 && <p className="mt-2 text-center text-xs text-[#b8afa6]">Review all {suggested.length} suggestion{suggested.length === 1 ? "" : "s"} first.</p>}
              {confirmed.length === 0 && suggested.length === 0 && <p className="mt-2 text-center text-xs text-[#b8afa6]">Add one experience to begin.</p>}
            </div>

            <div className="mt-4 rounded-2xl bg-white border border-[#ece6da] p-5 sm:p-6">
              <div className="flex items-center justify-between"><div><p className="text-[11px] uppercase tracking-[0.14em] font-bold text-gray-400">CV draft</p><h2 className="mt-1 font-bold text-[#1e1813]">Review every word</h2></div>{cv && <span className="text-[10px] font-bold text-green-700 bg-green-50 rounded-full px-2 py-1">Saved draft</span>}</div>
              {cv ? <>
                <textarea value={cv.cv_text} onChange={(e) => setCv({ ...cv, cv_text: e.target.value })} rows={26} className="mt-4 w-full rounded-xl border border-[#ece6da] bg-[#fffdfa] p-4 text-sm leading-relaxed text-[#1e1813] resize-y" aria-label="Editable CV text" />
                <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dac9bf] px-3 py-2.5 text-sm font-semibold text-[#1e1813] disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save</button><button onClick={() => downloadWordDoc(cv.cv_text, "my-first-cv.doc")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1e1813] px-3 py-2.5 text-sm font-semibold text-white"><Download className="w-4 h-4" />Download Word</button></div>
                <button onClick={useForApplication} className="mt-3 w-full flex items-center justify-center rounded-xl bg-[#fff7f4] py-2.5 text-sm font-semibold text-[#dc4f33]">Use this CV for a real application</button>
              </> : <div className="py-16 text-center"><FileText className="w-9 h-9 mx-auto text-gray-200" /><p className="mt-3 text-sm font-medium text-gray-500">Your editable CV will appear here.</p><p className="mt-1 text-xs text-gray-400">We leave out anything your evidence cannot support.</p></div>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
