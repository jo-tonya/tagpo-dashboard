// §20-2: 案件一覧のスケルトン UI
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded bg-gray-200" />
      </div>

      {/* フィルタバー */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50 p-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-20 rounded bg-gray-200" />
        ))}
      </div>

      {/* テーブル */}
      <div className="rounded-lg border bg-white">
        <div className="border-b p-3">
          <div className="grid grid-cols-7 gap-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-4 rounded bg-gray-200" />
            ))}
          </div>
        </div>
        {[...Array(8)].map((_, rowIdx) => (
          <div key={rowIdx} className="border-b p-3 last:border-b-0">
            <div className="grid grid-cols-7 gap-3">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-4 rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
