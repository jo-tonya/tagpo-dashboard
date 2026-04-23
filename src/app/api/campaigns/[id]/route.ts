import { NextResponse } from 'next/server'
import { getCampaign, updateCampaign, deleteCampaign } from '@/lib/data/campaigns'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    const campaign = await getCampaign(campaignId)
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(campaign)
  } catch (error) {
    console.error(`GET /api/campaigns/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    const body = await request.json()
    const campaign = await updateCampaign(campaignId, body)
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(campaign)
  } catch (error) {
    console.error(`PUT /api/campaigns/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    const success = await deleteCampaign(campaignId)
    if (!success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`DELETE /api/campaigns/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
