import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { certainty } = await request.json()
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .update({ certainty })
    .eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true })
}
