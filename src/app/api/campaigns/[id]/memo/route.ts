import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    const { memo } = await request.json()
    const supabase = await createClient()
    const { error } = await supabase
      .from('campaigns')
      .update({ memo })
      .eq('id', campaignId)
    if (error) throw error
    revalidatePath('/', 'layout')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`PUT /api/campaigns/${id}/memo error:`, error)
    return NextResponse.json({ error: 'Failed to update memo' }, { status: 500 })
  }
}
