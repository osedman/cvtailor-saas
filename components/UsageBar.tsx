import Link from 'next/link'

interface Props {
  used: number
  limit: number
}

export default function UsageBar({ used, limit }: Props) {
  const pct = Math.min((used / limit) * 100, 100)
  const remaining = limit - used

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
      <div className="flex-1">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{used} of {limit} tailors used this month</span>
          <span>{remaining > 0 ? `${remaining} left` : 'Limit reached'}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 66 ? 'bg-amber-400' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Link
        href="/pricing"
        className="text-xs text-brand-600 font-medium whitespace-nowrap hover:underline"
      >
        Upgrade for unlimited
      </Link>
    </div>
  )
}
