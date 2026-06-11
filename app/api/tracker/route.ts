import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 10

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_tracker')
      .select('*')
      .eq('user_id', user.id)
      .order('status')
      .order('position')

    if (error) throw error
    return NextResponse.json({ jobs: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()

    const { data, error } = await supabase
      .from('job_tracker')
      .insert({ ...body, user_id: user.id, notes: body.notes ?? [] })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ job: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
