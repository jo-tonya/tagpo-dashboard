import { NextResponse } from 'next/server'
import { getReceivables } from '@/lib/data/receivables'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || undefined
  const items = await getReceivables(month)
  return NextResponse.json(items)
}
