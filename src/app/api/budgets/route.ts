import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { upsertMonthlyBudget, getMonthlyBudgets } from '@/lib/data/budgets'

export async function GET() {
  try {
    const data = await getMonthlyBudgets()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { month, revenue, gross_margin_rate, note } = body

    if (!month || typeof month !== 'string') {
      return NextResponse.json({ error: 'month is required' }, { status: 400 })
    }

    const result = await upsertMonthlyBudget({
      month,
      revenue: Number(revenue) || 0,
      gross_margin_rate: Number(gross_margin_rate) || 0,
      note: typeof note === 'string' ? note : null,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
    revalidatePath('/budgets', 'layout')
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
