import { createClient } from '@/lib/supabase/server'
import { Personnel, PersonnelPayment } from '../types'

export async function getPersonnel(): Promise<Personnel[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function getPersonnelPayments(): Promise<PersonnelPayment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personnel_payments')
    .select('*')
    .order('target_month')
  if (error) throw error
  return data || []
}

export async function createPersonnel(name: string, role: string): Promise<Personnel> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personnel')
    .insert({ name, role })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePersonnel(id: string, updates: Partial<Personnel>): Promise<Personnel> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personnel')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertPersonnelPayment(
  personnelId: string,
  targetMonth: string,
  amount: number
): Promise<PersonnelPayment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personnel_payments')
    .upsert(
      { personnel_id: personnelId, target_month: targetMonth, amount, payment_type: 'salary' },
      { onConflict: 'personnel_id,target_month,payment_type' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
