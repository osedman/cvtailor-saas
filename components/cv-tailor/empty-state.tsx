"use client"

export function EmptyState() {
  return (
    <div className="relative mt-8 p-6 rounded-lg overflow-hidden">
      {/* Ghosted preview */}
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
      
      {/* Overlay text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm text-gray-400 bg-white/80 px-4 py-2 rounded-lg">
          Your tailored CV will appear here
        </span>
      </div>
    </div>
  )
}
