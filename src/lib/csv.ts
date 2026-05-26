/**
 * 2次元配列を CSV 文字列に変換。
 * カンマ・ダブルクォート・改行を含むセルはダブルクォートでエスケープする。
 */
export function rowsToCsv(rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  return rows.map(row => row.map(escape).join(',')).join('\n')
}

/**
 * 文字列を CSV ファイルとしてブラウザでダウンロード。
 * Excel が UTF-8 として認識するよう BOM を付与する。
 */
export function downloadCsv(filename: string, csv: string) {
  const bom = '﻿'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
