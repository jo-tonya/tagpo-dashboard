import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { personnel_id, target_month, amount } = await request.json()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('personnel_payments')
      .upsert(
        { personnel_id, target_month, amount, payment_type: 'salary' },
        { onConflict: 'personnel_id,target_month,payment_type' }
      )
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
