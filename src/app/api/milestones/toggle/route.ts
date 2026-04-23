import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { campaign_id, milestone_key, checked } = await request.json()
    const supabase = await createClient()

    const { error } = await supabase
      .from('milestone_checks')
      .upsert(
        {
          campaign_id,
          milestone_key,
          checked,
          checked_at: checked ? new Date().toISOString() : null,
        },
        { onConflict: 'campaign_id,milestone_key' }
      )
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/milestones/toggle error:', error)
    return NextResponse.json({ error: 'Failed to toggle milestone' }, { status: 500 })
  }
}
