import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const [personnelRes, paymentsRes] = await Promise.all([
      supabase.from('personnel').select('*').order('created_at'),
      supabase.from('personnel_payments').select('*').order('target_month'),
    ])
    if (personnelRes.error) throw personnelRes.error
    if (paymentsRes.error) throw paymentsRes.error
    return NextResponse.json({
      personnel: personnelRes.data || [],
      payments: paymentsRes.data || [],
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { name, role } = await request.json()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('personnel')
      .insert({ name, role })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
