import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'sb-wgpaaafseibcqagiiavt-auth-token'

export async function POST(req: NextRequest) {
  const { access_token, refresh_token } = await req.json()

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true })

  // Set the session as an HTTP cookie readable by the server
  const cookieValue = JSON.stringify([access_token, refresh_token])

  res.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: false, // Supabase client needs to read it too
    secure: false,   // localhost
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return res
}
