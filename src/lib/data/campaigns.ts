import { createClient } from '@/lib/supabase/server'
import { Campaign, CampaignSubcontract, CampaignCost, getBillingMonth } from '../types'

export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('view_complete', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getCampaign(id: number): Promise<Campaign | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function getCampaignSubcontracts(campaignId: number): Promise<CampaignSubcontract[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaign_subcontracts')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('sort_order')
  if (error) {
    console.error('Error fetching subcontracts:', error.message)
    return []
  }
  return data || []
}

export async function getCampaignCosts(campaignId: number): Promise<CampaignCost[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaign_costs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('target_month')
  if (error) {
    console.error('Error fetching campaign costs:', error.message)
    return []
  }
  return data || []
}

export async function getMilestoneChecks(): Promise<Record<string, boolean>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('milestone_checks')
    .select('*')
  if (error) throw error
  const checksMap: Record<string, boolean> = {}
  for (const row of data || []) {
    if (row.checked) {
      checksMap[`${row.campaign_id}-${row.milestone_key}`] = true
    }
  }
  return checksMap
}

export async function createCampaign(
  data: Partial<Campaign> & {
    subcontracts?: Omit<CampaignSubcontract, 'id' | 'campaign_id'>[]
  }
): Promise<Campaign> {
  const supabase = await createClient()
  const { subcontracts, ...campaignData } = data

  // Remove fields that shouldn't be inserted
  const { id: _id, created_at: _ca, updated_at: _ua, ...cleanData } = campaignData as Campaign

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert(cleanData)
    .select()
    .single()
  if (error) throw error

  if (subcontracts && subcontracts.length > 0) {
    const rows = subcontracts.map(s => ({ ...s, campaign_id: campaign.id }))
    await supabase.from('campaign_subcontracts').insert(rows)

    // campaign_costs にも連動（再生完了月を target_month とする）
    const billingMonth = getBillingMonth(campaign)
    for (const sub of subcontracts) {
      if (sub.delegated_amount > 0 && billingMonth) {
        await supabase.from('campaign_costs').insert({
          campaign_id: campaign.id,
          cost_type: `subcontract_${sub.sort_order}`,
          cost_label: `${sub.company_name} 支払額`,
          amount: sub.delegated_amount,
          target_month: billingMonth,
        })
      }
    }
  }

  return campaign
}

export async function updateCampaign(
  id: number,
  data: Partial<Campaign> & {
    subcontracts?: Omit<CampaignSubcontract, 'id' | 'campaign_id'>[]
  }
): Promise<Campaign | null> {
  const supabase = await createClient()
  const { subcontracts, ...campaignData } = data

  // id, created_at, updated_at を除外
  const { id: _id, created_at: _ca, updated_at: _ua, ...cleanData } = campaignData as Campaign

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .update(cleanData)
    .eq('id', id)
    .select()
    .single()
  if (error) return null

  if (subcontracts !== undefined) {
    await supabase.from('campaign_subcontracts').delete().eq('campaign_id', id)
    await supabase.from('campaign_costs').delete().eq('campaign_id', id).like('cost_type', 'subcontract_%')

    if (subcontracts.length > 0) {
      const rows = subcontracts.map(s => ({ ...s, campaign_id: id }))
      await supabase.from('campaign_subcontracts').insert(rows)

      for (const sub of subcontracts) {
        if (sub.delegated_amount > 0) {
          const targetMonth = getBillingMonth(campaign) || getBillingMonth(cleanData as Campaign)
          if (targetMonth) {
            await supabase.from('campaign_costs').insert({
              campaign_id: id,
              cost_type: `subcontract_${sub.sort_order}`,
              cost_label: `${sub.company_name} 支払額`,
              amount: sub.delegated_amount,
              target_month: targetMonth,
            })
          }
        }
      }
    }
  }

  return campaign
}

export async function deleteCampaign(id: number): Promise<boolean> {
  const supabase = await createClient()
  await supabase.from('milestone_checks').delete().eq('campaign_id', id)
  const { error } = await supabase.from('campaigns').delete().eq('id', id)
  return !error
}
