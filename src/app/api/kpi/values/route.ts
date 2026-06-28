import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { upsertKpiManualValue } from '@/lib/data/kpi'
import { KpiManualKind, KpiMetricKey } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { month, metric_key, kind, value } = body as {
      month?: string
      metric_key?: KpiMetricKey
      kind?: KpiManualKind
      value?: number | string
    }

    if (!month || typeof month !== 'string') {
      return NextResponse.json({ error: 'month is required' }, { status: 400 })
    }
    if (!metric_key) {
      return NextResponse.json({ error: 'metric_key is required' }, { status: 400 })
    }
    const k: KpiManualKind = kind === 'actual' ? 'actual' : 'target'

    const result = await upsertKpiManualValue({
      month,
      metric_key,
      kind: k,
      value: Number(value) || 0,
    })
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
