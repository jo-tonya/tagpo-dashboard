import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function PUT(request: NextRequest) {
  const { target_month, status } = await request.json()
  const supabase = await createClient()
  const { error } = await supabase
    .from('personnel_payments')
    .update({ status })
    .eq('target_month', target_month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true })
}
