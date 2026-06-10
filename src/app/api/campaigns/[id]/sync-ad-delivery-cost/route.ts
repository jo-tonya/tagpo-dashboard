import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  const { amount } = await request.json()
  const supabase = await createClient()

  const finalAmount = amount

  if (finalAmount == null || finalAmount <= 0) {
    await supabase
      .from('campaign_costs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('cost_type', 'ad_delivery')
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true, deleted: true })
  }

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('view_complete')
    .eq('id', campaignId)
    .single()

  const targetMonth = campaign?.view_complete
    ? `${campaign.view_complete.slice(0, 7)}-01`
    : null

  const { data: existing } = await supabase
    .from('campaign_costs')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('cost_type', 'ad_delivery')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('campaign_costs')
      .update({
        amount: finalAmount,
        target_month: targetMonth,
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('campaign_costs')
      .insert({
        campaign_id: campaignId,
        cost_type: 'ad_delivery',
        cost_label: '広告配信費',
        amount: finalAmount,
        target_month: targetMonth,
      })
  }

  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true, amount: finalAmount })
}
