// マイルストーン定義（tagpo-projectsから移植）

export interface MilestoneDef {
  key: string
  dbCol: string
  label: string
  action: string
  deadlineOffset: (d: string) => string
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export const MS_DEFS: MilestoneDef[] = [
  { key: 'esCollection',  dbCol: 'es_collection',  label: 'ES回収',                      action: '回収済み',            deadlineOffset: (d) => d },
  { key: 'infoRelease',   dbCol: 'info_release',    label: 'ユーザー募集開始（情報解禁）', action: 'クライアントに中途報告', deadlineOffset: (d) => addDays(d, 5) },
  { key: 'postStart',     dbCol: 'post_start',      label: '投稿開始',                    action: 'クライアントに中途報告', deadlineOffset: (d) => addDays(d, -3) },
  { key: 'postEnd',       dbCol: 'post_end',        label: '投稿期限',                    action: 'クライアントに報告',    deadlineOffset: (d) => addDays(d, 3) },
  { key: 'viewComplete',  dbCol: 'view_complete',   label: '再生完了',                    action: 'クライアントに報告',    deadlineOffset: (d) => addDays(d, 1) },
  { key: 'reportSend',    dbCol: 'report_send',     label: 'レポート送付',                action: 'レポート送付',          deadlineOffset: (d) => d },
]

/**
 * マイルストーンが遅延しているかどうか
 */
export function isMilestoneOverdue(
  dateStr: string | null,
  deadlineOffset: (d: string) => string,
  checked: boolean
): boolean {
  if (checked || !dateStr) return false
  const deadline = deadlineOffset(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86400000)
  return diff < 0
}

/**
 * 日付までの日数差を返す（過去なら負の値）
 */
export function daysDiff(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}
