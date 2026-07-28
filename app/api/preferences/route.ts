import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toTemplateId, CV_TEMPLATES } from '@/lib/cv-templates'

export const maxDuration = 10

/** Read the signed-in user's display preferences. */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('profiles')
      .select('cv_template')
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw error

    // Narrow here rather than trusting the column: a template retired from the
    // product must degrade to the default, never render an undefined token set.
    return NextResponse.json({ cvTemplate: toTemplateId(data?.cv_template) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Update preferences: { cvTemplate: CvTemplateId } */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const requested = body?.cvTemplate
    if (typeof requested !== 'string' || !(requested in CV_TEMPLATES)) {
      return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ cv_template: requested })
      .eq('id', user.id)
    if (error) throw error

    return NextResponse.json({ cvTemplate: requested })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
