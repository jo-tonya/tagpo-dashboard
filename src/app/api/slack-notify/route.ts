import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Milestone definitions (same as frontend, using camelCase keys)
const MS_DEFS = [
  { k: 'esCollection', fk: 'esCollection', label: 'ES回収', action: '回収済みチェック', deadlineOffset: (d: string) => d },
  { k: 'infoRelease', fk: 'infoRelease', label: 'ユーザー募集開始（情報解禁）', action: 'クライアントに中途報告', deadlineOffset: (d: string) => addDays(d, 5) },
  { k: 'postStart', fk: 'postStart', label: '投稿開始', action: 'クライアントに中途報告', deadlineOffset: (d: string) => addDays(d, -3) },
  { k: 'postEnd', fk: 'postEnd', label: '投稿期限', action: 'クライアントに報告', deadlineOffset: (d: string) => addDays(d, 3) },
  { k: 'viewComplete', fk: 'viewComplete', label: '再生完了', action: 'クライアントに報告', deadlineOffset: (d: string) => addDays(d, 1) },
  { k: 'reportSend', fk: 'reportSend', label: 'レポート送付', action: 'レポート送付', deadlineOffset: (d: string) => d },
]

// DB column mapping (snake_case in DB)
const DB_COL_MAP: Record<string, string> = {
  esCollection: 'es_collection',
  infoRelease: 'info_release',
  postStart: 'post_start',
  postEnd: 'post_end',
  viewComplete: 'view_complete',
  reportSend: 'report_send',
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function dDiff(dateStr: string): number {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Fetch data
    const { data: campaigns, error: campErr } = await supabase.from('campaigns').select('*')
    if (campErr) throw campErr

    const { data: checkRows, error: checkErr } = await supabase.from('milestone_checks').select('*')
    if (checkErr) throw checkErr

    // Build checks map
    const checksMap: Record<string, boolean> = {}
    for (const row of checkRows || []) {
      if (row.checked) {
        checksMap[`${row.campaign_id}-${row.milestone_key}`] = true
      }
    }

    // Find overdue items
    const overdueItems: { maker: string; product: string; items: { milestone: string; action: string; daysOverdue: number }[] }[] = []

    for (const camp of campaigns || []) {
      const campOverdues: { milestone: string; action: string; daysOverdue: number }[] = []

      for (const ms of MS_DEFS) {
        const dbCol = DB_COL_MAP[ms.k]
        const dateVal = camp[dbCol]
        if (!dateVal) continue

        const checked = checksMap[`${camp.id}-${ms.fk}`]
        if (checked) continue

        const deadline = ms.deadlineOffset(dateVal)
        const diff = dDiff(deadline)

        if (diff < 0) {
          campOverdues.push({
            milestone: ms.label,
            action: ms.action,
            daysOverdue: Math.abs(diff),
          })
        }
      }

      if (campOverdues.length > 0) {
        overdueItems.push({
          maker: camp.maker,
          product: camp.product,
          items: campOverdues,
        })
      }
    }

    if (overdueItems.length === 0) {
      return NextResponse.json({ message: 'No overdue items', count: 0 })
    }

    // Build Slack message
    const now = new Date()
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}`
    let message = `⚠️ Tagpo 案件アラート（${dateStr}）\n\n`

    for (const item of overdueItems) {
      message += `🔴 ${item.maker} / ${item.product}\n`
      for (const overdue of item.items) {
        message += `　・${overdue.milestone} → ${overdue.action}が${overdue.daysOverdue}日遅延中\n`
      }
      message += '\n'
    }

    const dashboardUrl = process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_VERCEL_URL
    if (dashboardUrl) {
      message += `📊 ダッシュボード: ${dashboardUrl.startsWith('http') ? dashboardUrl : `https://${dashboardUrl}`}/milestones`
    }

    // Send to Slack if webhook is configured
    if (slackWebhookUrl) {
      const slackRes = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      })

      if (!slackRes.ok) {
        console.error('Slack webhook error:', await slackRes.text())
        return NextResponse.json({ error: 'Slack notification failed' }, { status: 500 })
      }
    }

    return NextResponse.json({
      message: 'Notification sent',
      overdueCount: overdueItems.length,
      details: overdueItems,
      slackConfigured: !!slackWebhookUrl,
    })
  } catch (error) {
    console.error('Slack notify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
