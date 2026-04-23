import { createClient } from '@/lib/supabase/server'
import { Influencer, InfluencerPayment } from '../types'

export async function getInfluencers(): Promise<Influencer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .eq('is_active', true)
    .order('number')
  if (error) throw error
  return data || []
}

export async function getInfluencerPaymentsByMonth(month: string): Promise<(InfluencerPayment & { username: string; number: string | null })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('influencer_payments')
    .select('*, influencers(username, number)')
    .eq('target_month', month)
    .order('influencer_id')
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    ...(row as unknown as InfluencerPayment),
    username: (row.influencers as { username?: string })?.username || '',
    number: (row.influencers as { number?: string | null })?.number || null,
  }))
}

export async function createInfluencer(username: string): Promise<Influencer> {
  const supabase = await createClient()
  const { data: maxRow } = await supabase
    .from('influencers')
    .select('number')
    .order('number', { ascending: false })
    .limit(1)
    .single()
  const nextNum = maxRow?.number ? String(Number(maxRow.number) + 1).padStart(3, '0') : '001'

  const { data, error } = await supabase
    .from('influencers')
    .insert({ username, number: nextNum })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertInfluencerPayment(
  influencerId: string,
  targetMonth: string,
  amount: number,
  transferStatus?: string
): Promise<InfluencerPayment> {
  const supabase = await createClient()
  const payload: Record<string, unknown> = {
    influencer_id: influencerId,
    target_month: targetMonth,
    amount,
  }
  if (transferStatus) payload.transfer_status = transferStatus

  const { data, error } = await supabase
    .from('influencer_payments')
    .upsert(payload, { onConflict: 'influencer_id,target_month' })
    .select()
    .single()
  if (error) throw error
  return data as InfluencerPayment
}

export async function updateTransferStatus(
  paymentId: string,
  status: string
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('influencer_payments')
    .update({ transfer_status: status })
    .eq('id', paymentId)
  if (error) throw error
}
