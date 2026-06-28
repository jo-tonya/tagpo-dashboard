import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createKpiAction, updateKpiAction, deleteKpiAction } from '@/lib/data/kpi'

// 新規アクション作成
export async function POST(request: NextRequest) {
  try {
    const { month, text, sort_order } = await request.json()
    if (!month || typeof month !== 'string') {
      return NextResponse.json({ error: 'month is required' }, { status: 400 })
    }
    const result = await createKpiAction(month, typeof text === 'string' ? text : '', Number(sort_order) || 0)
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// テキスト編集／チェック切替
export async function PATCH(request: NextRequest) {
  try {
    const { id, text, checked } = await request.json()
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    const patch: { text?: string; checked?: boolean } = {}
    if (typeof text === 'string') patch.text = text
    if (typeof checked === 'boolean') patch.checked = checked
    const result = await updateKpiAction(id, patch)
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// 削除
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    const result = await deleteKpiAction(id)
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
