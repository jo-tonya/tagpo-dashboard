import { createClient } from '@/lib/supabase/server'
import { FixedCost } from '../types'

export async function getFixedCosts(category?: string): Promise<FixedCost[]> {
  const supabase = await createClient()
  let query = supabase.from('fixed_costs').select('*').order('target_month')
  if (category) query = query.eq('cost_category', category)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function upsertFixedCost(cost: Omit<FixedCost, 'id'>): Promise<FixedCost> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fixed_costs')
    .upsert(cost, { onConflict: 'cost_category,cost_subcategory,target_month' })
    .select()
    .single()
  if (error) throw error
  return data
}
