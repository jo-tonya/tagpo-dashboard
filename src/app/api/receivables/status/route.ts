import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest) {
  const { campaign_id, billing_month, receive_month, expected_amount, actual_amount, status, note } = await request.json()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('receivables')
    .select('id')
    .eq('campaign_id', campaign_id)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('receivables')
      .update({ actual_amount, status, note, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('receivables')
      .insert({
        campaign_id,
        billing_month,
        receive_month,
        expected_amount,
        actual_amount,
        status,
        note,
      })
  }

  return NextResponse.json({ ok: true })
}
