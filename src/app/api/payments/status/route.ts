import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(request: Request) {
  try {
    const { sourceTable, sourceId, status } = await request.json()
    const supabase = await createClient()

    if (sourceTable === 'personnel_payments') {
      const { error } = await supabase
        .from('personnel_payments')
        .update({ status })
        .eq('id', sourceId)
      if (error) throw error
    } else if (sourceTable === 'fixed_costs') {
      const { error } = await supabase
        .from('fixed_costs')
        .update({ status })
        .eq('id', sourceId)
      if (error) throw error
    } else if (sourceTable === 'influencer_payments') {
      // For influencer, sourceId is the month. Update all for that month.
      const { error } = await supabase
        .from('influencer_payments')
        .update({ transfer_status: status })
        .eq('target_month', sourceId)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
