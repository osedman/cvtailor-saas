'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PLANS } from '@/lib/stripe'

interface Props {
  isLoggedIn: boolean
}

export default function PricingCards({ isLoggedIn }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const { url } = await res.json()
    if (url) window.location.href = url
    else setLoading(false)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto text-left">
      {/* Free */}
      <div className="border border-gray-200 rounded-2xl p-6">
        <div className="mb-4">
          <h2 className="font-bold text-xl text-gray-900">{PLANS.free.name}</h2>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            £0 <span className="text-base font-normal text-gray-400">/month</span>
          </p>
        </div>

        <ul className="space-y-2 mb-6">
          {PLANS.free.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-green-500">✓</span> {f}
            </li>
          ))}
        </ul>

        {isLoggedIn ? (
          <Link
            href="/dashboard"
            className="block text-center border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/signup"
            className="block text-center border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Get started free
          </Link>
        )}
      </div>

      {/* Pro */}
      <div className="border-2 border-brand-600 rounded-2xl p-6 relative">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-brand-600 text-white text-xs font-medium px-3 py-1 rounded-full">
            Most popular
          </span>
        </div>

        <div className="mb-4">
          <h2 className="font-bold text-xl text-gray-900">{PLANS.pro.name}</h2>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            £{PLANS.pro.price} <span className="text-base font-normal text-gray-400">/month</span>
          </p>
        </div>

        <ul className="space-y-2 mb-6">
          {PLANS.pro.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-brand-600">✓</span> {f}
            </li>
          ))}
        </ul>

        {isLoggedIn ? (
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-brand-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Redirecting…' : 'Upgrade to Pro'}
          </button>
        ) : (
          <Link
            href="/signup"
            className="block text-center bg-brand-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Get started
          </Link>
        )}
      </div>
    </div>
  )
}
