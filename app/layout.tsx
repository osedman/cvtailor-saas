import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import { ProductAnalytics } from '@/components/analytics'
import { AuthProvider } from '@/components/auth/auth-provider'
import { Onboarding } from '@/components/onboarding/onboarding'
import './globals.css'

const _geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const _geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: 'Tailr — Tailor Your CV to Any Job',
  description: 'AI-powered CV tailoring that helps you land more interviews',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-white">
      <body className={`font-sans antialiased bg-white text-[#1e1813] ${_geist.variable} ${_geistMono.variable}`}>
        <AuthProvider>
          {children}
          <Onboarding />
          <Toaster position="bottom-right" />
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <ProductAnalytics />}
      </body>
    </html>
  )
}
