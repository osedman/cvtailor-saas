'use client'

import { useState } from 'react'
import Link from 'next/link'
import ResultPanel from './ResultPanel'

interface Props {
  isPro: boolean
  monthlyUsage: number
  freeLimit: number
}

export default function TailorForm({ isPro, monthlyUsage, freeLimit }: Props) {
  const [cv, setCv] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const atLimit = !isPro && monthlyUsage >= freeLimit

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (atLimit) return

    setLoading(true)
    setError('')
    setResult('')

    try {
      const res = await fetch('/api/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv, jobDescription }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'LIMIT_REACHED') {
          setError(`You've used all ${data.limit} free tailors this month. Upgrade to Pro for unlimited.`)
        } else {
          setError(data.error ?? 'Something went wrong. Please try again.')
        }
        return
      }

      setResult(data.result)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Your current CV
            </label>
            <textarea
              required
              value={cv}
              onChange={(e) => setCv(e.target.value)}
              rows={16}
              placeholder="Paste your full CV here…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Target job description
            </label>
            <textarea
              required
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={16}
              placeholder="Paste the job description here…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
            <span>{error}</span>
            {error.includes('Upgrade') && (
              <Link href="/pricing" className="font-medium underline whitespace-nowrap">
                See plans
              </Link>
            )}
          </div>
        )}

        {atLimit ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
            <p className="text-sm text-amber-800 mb-3">
              You've used all {freeLimit} free tailors for this month.
            </p>
            <Link
              href="/pricing"
              className="inline-block bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              Upgrade to Pro — unlimited tailors
            </Link>
          </div>
        ) : (
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Tailoring your CV…' : 'Tailor my CV'}
          </button>
        )}
      </form>

      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">Analysing your CV and the job description…</p>
        </div>
      )}

      {result && <ResultPanel result={result} />}
    </div>
  )
}
