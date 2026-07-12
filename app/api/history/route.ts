import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 10

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('tailor_history')
      .select('id, created_at, job_title, company_name, job_url, job_snippet, job_description, match_score, result, original_cv, feedback, upskill')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ history: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
