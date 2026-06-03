"use client"

import { Check } from "lucide-react"

const STEPS = [
  "Analysing job requirements",
  "Matching your experience",
  "Rewriting bullet points",
  "Checking ATS compatibility",
  "Finalising your CV",
]

interface ProgressStepsProps {
  currentStep: number // 0-based index of the active step
}

export function ProgressSteps({ currentStep }: ProgressStepsProps) {
  return (
    <div className="w-full max-w-xs mx-auto mt-3 space-y-1.5">
      {STEPS.map((step, i) => {
        const done = i < currentStep
        const active = i === currentStep
        return (
          <div
            key={step}
            className={`flex items-center gap-2.5 text-xs transition-all duration-300 ${
              done ? "text-gray-400" : active ? "text-[#0f0f0f] font-medium" : "text-gray-300"
            }`}
          >
            <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
              done
                ? "bg-green-100 text-green-500"
                : active
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-300"
            }`}>
              {done ? (
                <Check className="w-2.5 h-2.5" />
              ) : active ? (
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              ) : (
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
              )}
            </div>
            <span>{step}</span>
          </div>
        )
      })}
    </div>
  )
}

export const TOTAL_STEPS = STEPS.length
