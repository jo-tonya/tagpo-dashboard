'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface ImportResult {
  success: boolean
  sheets_found: string[]
  summary: Record<string, { imported: number; errors: number }>
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
      } else {
        setError(data.error || 'インポートに失敗しました')
      }
    } catch {
      setError('インポートに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Excelインポート</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ファイルアップロード</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Excelファイル（.xlsx）</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <Button
            onClick={handleImport}
            disabled={!file || loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="mr-2 h-4 w-4" />
            {loading ? 'インポート中...' : 'インポート実行'}
          </Button>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">インポート完了</span>
              </div>
              <div className="text-sm text-gray-500">
                検出シート: {result.sheets_found.join(', ')}
              </div>
              <div className="space-y-2">
                {Object.entries(result.summary).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between text-sm rounded-lg bg-gray-50 p-3">
                    <span className="font-medium">{key}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-green-600">成功: {val.imported}</span>
                      {val.errors > 0 && <span className="text-red-600">エラー: {val.errors}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
