"use client"

import { Target, MessagesSquare, Building2, LayoutDashboard, type LucideIcon } from "lucide-react"

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Target, title: "Tailor & score", desc: "Evidence-checked rewrite + match score" },
  { icon: MessagesSquare, title: "Interview prep", desc: "The questions you'll likely be asked" },
  { icon: Building2, title: "Company research", desc: "A one-click brief on the company" },
  { icon: LayoutDashboard, title: "Track applications", desc: "Every job on one board" },
]

const STEPS = [
  ["Add your CV", "Upload a PDF or DOCX, or paste it in"],
  ["Paste the job", "Or drop a LinkedIn / Indeed link to auto-fill"],
  ["Hit Tailor", "Get your rewrite and match score in ~30s"],
]

export function EmptyState({ guide = false }: { guide?: boolean }) {
  if (!guide) {
    return (
      <div className="relative mt-8 p-6 rounded-lg overflow-hidden">
        <div className="opacity-30 blur-sm pointer-events-none">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="h-4 w-48 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-5/6 bg-gray-100 rounded" />
              <div className="h-3 w-4/5 bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
            </div>
            <div className="mt-6 flex gap-2">
              <div className="h-8 w-20 bg-gray-100 rounded" />
              <div className="h-8 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-gray-400 bg-white/80 px-4 py-2 rounded-lg">
            Your tailored CV will appear here
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Three-step guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STEPS.map(([title, desc], i) => (
          <div key={i} className="flex items-start gap-3 bg-white border border-[#ece6da] rounded-2xl p-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#dc4f33] text-white text-sm font-extrabold flex items-center justify-center">{i + 1}</span>
            <div>
              <p className="text-sm font-bold text-[#1e1813] leading-snug">{title}</p>
              <p className="text-[12px] text-gray-500 leading-snug mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Feature strip */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400 mb-2.5">What you can do with Tailr</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white border border-[#ece6da] rounded-2xl p-4">
              <Icon className="w-5 h-5 text-[#dc4f33]" />
              <p className="text-[13px] font-semibold text-[#1e1813] mt-2">{title}</p>
              <p className="text-[11.5px] text-gray-500 leading-snug mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
