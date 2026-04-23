import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calcRequiredViews } from '@/lib/calculations'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  const { amount } = await request.json()
  const supabase = await createClient()

  // amount が null の場合、campaigns テーブルから自動計算
  let finalAmount = amount
  if (finalAmount == null) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('budget, unit_price, user_reward_unit_price')
      .eq('id', campaignId)
      .single()
    if (campaign?.budget && campaign?.unit_price && campaign?.user_reward_unit_price) {
      const rv = calcRequiredViews(campaign.budget, campaign.unit_price)
      finalAmount = Math.round(rv * campaign.user_reward_unit_price)
    }
  }

  if (finalAmount == null || finalAmount <= 0) {
    await supabase
      .from('campaign_costs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('cost_type', 'tonya_user_payment')
    return NextResponse.json({ ok: true, deleted: true })
  }

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('billing_month')
    .eq('id', campaignId)
    .single()

  const { data: existing } = await supabase
    .from('campaign_costs')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('cost_type', 'tonya_user_payment')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('campaign_costs')
      .update({
        amount: finalAmount,
        target_month: campaign?.billing_month || null,
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('campaign_costs')
      .insert({
        campaign_id: campaignId,
        cost_type: 'tonya_user_payment',
        cost_label: 'ユーザー報酬',
        amount: finalAmount,
        target_month: campaign?.billing_month || null,
      })
  }

  return NextResponse.json({ ok: true, amount: finalAmount })
}
