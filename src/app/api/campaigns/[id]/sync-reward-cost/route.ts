import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { calcRequiredViews, userRewardBufferFactor } from '@/lib/calculations'

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
      .select('budget, unit_price, user_reward_unit_price, certainty')
      .eq('id', campaignId)
      .single()
    if (campaign?.budget && campaign?.unit_price) {
      // 改修㉕: 単価未設定はデフォルト 0.4、見込み（D/E）は ×1.1 バッファ
      const rate = campaign.user_reward_unit_price ?? 0.4
      const rv = calcRequiredViews(campaign.budget, campaign.unit_price)
      finalAmount = Math.round(rv * rate * userRewardBufferFactor(campaign.certainty))
    }
  }

  // §23: null（未入力）のみ削除。0 は明示 0 として upsert。
  if (finalAmount == null) {
    await supabase
      .from('campaign_costs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('cost_type', 'tonya_user_payment')
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
    .eq('cost_type', 'tonya_user_payment')
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
        cost_type: 'tonya_user_payment',
        cost_label: 'ユーザー報酬',
        amount: finalAmount,
        target_month: targetMonth,
      })
  }

  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true, amount: finalAmount })
}
