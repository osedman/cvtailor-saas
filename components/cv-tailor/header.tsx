"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { LogOut, ChevronDown, Clock, Kanban, ShieldCheck } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { SignInModal } from "@/components/auth/sign-in-modal"
import { isAdminEmail } from "@/lib/admin"

interface HeaderProps {
  onSignInClick?: () => void
  onHistoryClick?: () => void
}

export function Header({ onSignInClick, onHistoryClick }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { user, loading, signOut } = useAuth()

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
          scrolled ? "backdrop-blur-md bg-white/80 border-b border-gray-100" : "bg-white"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-medium text-[#0f0f0f] tracking-tight">CV Tailor</span>

          <div className="flex items-center gap-4">
            {/* Nav links — only for signed-in users */}
            {!loading && user && (
              <>
                {onHistoryClick && (
                  <button
                    onClick={onHistoryClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#2563eb] hover:bg-blue-50 rounded-lg transition-colors"
                    title="Tailor history"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden sm:block">History</span>
                  </button>
                )}
                <Link
                  href="/tracker"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#2563eb] hover:bg-blue-50 rounded-lg transition-colors"
                  title="Job tracker"
                >
                  <Kanban className="w-4 h-4" />
                  <span className="hidden sm:block">Tracker</span>
                </Link>
                {isAdminEmail(user.email) && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#2563eb] hover:bg-blue-50 rounded-lg transition-colors"
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
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-[#0f0f0f] transition-colors rounded-lg hover:bg-gray-50"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#2563eb] flex items-center justify-center text-white text-xs font-medium">
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
                  className="px-3.5 py-1.5 text-sm font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] transition-colors duration-150"
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
