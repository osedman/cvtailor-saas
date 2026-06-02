'use client'

import { useState } from 'react'

interface Props {
  result: string
}

// Split the result into named sections
function parseSections(text: string) {
  const sections: { title: string; body: string }[] = []
  const sectionRegex = /###\s+\d+\.\s+(.+)\n([\s\S]*?)(?=###\s+\d+\.|$)/g
  let match

  while ((match = sectionRegex.exec(text)) !== null) {
    sections.push({ title: match[1].trim(), body: match[2].trim() })
  }

  // Fallback: return raw text if parsing fails
  if (sections.length === 0) {
    return [{ title: 'Result', body: text }]
  }

  return sections
}

export default function ResultPanel({ result }: Props) {
  const sections = parseSections(result)
  const [activeTab, setActiveTab] = useState(0)
  const [copied, setCopied] = useState(false)

  const tailoredCV = sections.find((s) => s.title.includes('TAILORED CV'))?.body ?? ''

  async function handleCopy() {
    await navigator.clipboard.writeText(tailoredCV)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-gray-100 flex overflow-x-auto">
        {sections.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`text-xs font-medium px-4 py-3 whitespace-nowrap transition-colors border-b-2 ${
              activeTab === i
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5">
        {sections[activeTab]?.title.includes('TAILORED CV') && (
          <div className="flex justify-end mb-3">
            <button
              onClick={handleCopy}
              className="text-xs text-brand-600 font-medium hover:underline"
            >
              {copied ? '✓ Copied!' : 'Copy CV text'}
            </button>
          </div>
        )}
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
          {sections[activeTab]?.body}
        </pre>
      </div>
    </div>
  )
}
