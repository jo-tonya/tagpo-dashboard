import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const supabase = await createClient()
    let query = supabase.from('fixed_costs').select('*').order('target_month')
    if (category) query = query.eq('cost_category', category)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('fixed_costs')
      .upsert(body, { onConflict: 'cost_category,cost_subcategory,target_month' })
      .select()
      .single()
    if (error) throw error
    revalidatePath('/', 'layout')
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
