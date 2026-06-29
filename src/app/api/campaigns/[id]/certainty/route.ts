import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { calcRequiredViews, userRewardBufferFactor } from '@/lib/calculations'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  const { certainty } = await request.json()
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .update({ certainty })
    .eq('id', campaignId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 改修㉕: 確度が変わると自動算出のユーザー報酬の見込みバッファ（D/E は ×1.1）が変わる。
  // 手入力（user_reward_amount が非 null）でない案件のみ、再計算して campaign_costs を同期する。
  const { data: c } = await supabase
    .from('campaigns')
    .select('budget, unit_price, user_reward_unit_price, user_reward_amount, view_complete')
    .eq('id', campaignId)
    .single()

  if (c && c.user_reward_amount == null && c.budget && c.unit_price) {
    const rate = c.user_reward_unit_price ?? 0.4
    const rv = calcRequiredViews(c.budget, c.unit_price)
    const amount = Math.round(rv * rate * userRewardBufferFactor(certainty))
    const targetMonth = c.view_complete ? `${c.view_complete.slice(0, 7)}-01` : null

    const { data: existing } = await supabase
      .from('campaign_costs')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('cost_type', 'tonya_user_payment')
      .maybeSingle()

    if (existing) {
      await supabase
        .from('campaign_costs')
        .update({ amount, target_month: targetMonth })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('campaign_costs')
        .insert({
          campaign_id: campaignId,
          cost_type: 'tonya_user_payment',
          cost_label: 'ユーザー報酬',
          amount,
          target_month: targetMonth,
        })
    }
  }

  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true })
}
