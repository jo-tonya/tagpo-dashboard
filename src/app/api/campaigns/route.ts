import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createCampaign, getCampaigns } from '@/lib/data/campaigns'

export async function GET() {
  try {
    const campaigns = await getCampaigns()
    return NextResponse.json(campaigns)
  } catch (error) {
    console.error('GET /api/campaigns error:', error)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const campaign = await createCampaign(body)
    revalidatePath('/', 'layout')
    return NextResponse.json(campaign, { status: 201 })
  } catch (error) {
    console.error('POST /api/campaigns error:', error)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
