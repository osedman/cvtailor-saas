"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { LogOut, ChevronDown, Clock, Kanban, ShieldCheck, Target, TrendingUp } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { SignInModal } from "@/components/auth/sign-in-modal"
import { isAdminViewer } from "@/lib/admin"
import { useCareerBeta } from "@/hooks/use-career-beta"

interface HeaderProps {
  onSignInClick?: () => void
  onHistoryClick?: () => void
  enhanced?: boolean
}

export function Header({ onSignInClick, onHistoryClick, enhanced = false }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { user, loading, signOut } = useAuth()
  const careerBeta = useCareerBeta()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  function handleSignInClick() {
    if (onSignInClick) onSignInClick()
    else setShowModal(true)
  }

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-150 ease-out ${
          enhanced
            ? "backdrop-blur-md bg-white/85 border-b border-[#ece6da]"
            : scrolled ? "backdrop-blur-md bg-white/80 border-b border-gray-100" : "bg-white"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Tailr home">
            <svg width="26" height="26" viewBox="0 0 180 180" aria-hidden="true" className="rounded-[7px]">
              <rect width="180" height="180" rx="40" fill="#1e1813" />
              <path d="M92 50 V116 q0 16 16 16 H122" fill="none" stroke="#f9f6f0" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M66 76 H120" fill="none" stroke="#f9f6f0" strokeWidth="15" strokeLinecap="round" />
              <circle cx="128" cy="50" r="10.5" fill="#dc4f33" />
            </svg>
            <span className="inline-flex items-baseline gap-0.5 text-lg font-extrabold tracking-tight text-[#1e1813]">
              tailr
              <span className="w-1.5 h-1.5 rounded-full inline-block -translate-y-px bg-[#dc4f33]" />
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {/* Nav links — only for signed-in users */}
            {!loading && user && (
              <>
                {onHistoryClick && (
                  <button
                    onClick={onHistoryClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#dc4f33] hover:bg-[#ffeae4] rounded-lg transition-colors"
                    title="Tailor history"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden sm:block">History</span>
                  </button>
                )}
                <Link
                  href="/tracker"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#dc4f33] hover:bg-[#ffeae4] rounded-lg transition-colors"
                  title="Job tracker"
                >
                  <Kanban className="w-4 h-4" />
                  <span className="hidden sm:block">Tracker</span>
                </Link>
                {careerBeta && (<>
                <Link
                  href="/career-path"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#dc4f33] hover:bg-[#ffeae4] rounded-lg transition-colors"
                  title="Career path"
                >
                  <Target className="w-4 h-4" />
                  <span className="hidden sm:block">Career Path</span>
                </Link>
                <Link
                  href="/career-arc"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#dc4f33] hover:bg-[#ffeae4] rounded-lg transition-colors"
                  title="Career Arc"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span className="hidden sm:block">Career Arc</span>
                </Link>
                </>)}
                {isAdminViewer(user.email) && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#dc4f33] hover:bg-[#ffeae4] rounded-lg transition-colors"
                    title="Admin dashboard"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span className="hidden sm:block">Admin</span>
                  </Link>
                )}
              </>
            )}
            {!loading && (
              user ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className={`flex items-center gap-2 text-sm text-gray-600 hover:text-[#1e1813] transition-colors ${
                      enhanced
                        ? "pl-1 pr-2.5 py-1 rounded-full bg-white border border-[#ece6da] hover:border-[#dac9bf]"
                        : "px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#dc4f33] flex items-center justify-center text-white text-xs font-medium">
                      {user.email?.[0].toUpperCase()}
                    </div>
                    <span className="hidden sm:block max-w-[160px] truncate">{user.email}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1 overflow-hidden">
                        <button
                          onClick={() => { signOut(); setShowUserMenu(false) }}
                          className="w-full px-4 py-2.5 text-sm text-left text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleSignInClick}
                  className="px-3.5 py-1.5 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] transition-colors duration-150"
                >
                  Get started free
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {showModal && <SignInModal onClose={() => setShowModal(false)} />}
    </>
  )
}
