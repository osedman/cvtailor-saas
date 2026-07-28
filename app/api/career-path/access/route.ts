import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isCareerPathBeta } from '@/lib/feature-gate'

/**
 * Tells the client whether this user is in the career-path beta, so gated
 * surfaces (nav links, banners, the quick-wins strip) can hide rather than
 * render a button that would only 403. Deliberately reveals nothing about who
 * else is on the list.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ beta: isCareerPathBeta(user?.email) })
  } catch {
    return NextResponse.json({ beta: false })
  }
}
