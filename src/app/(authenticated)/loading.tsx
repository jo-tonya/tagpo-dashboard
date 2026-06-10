// §20-2: ダッシュボードのスケルトン UI（遷移直後の体感速度向上）
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* タイトル */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>

      {/* PL グラフ */}
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
        <div className="h-64 rounded bg-gray-100" />
      </div>

      {/* PL 表 */}
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-4 h-5 w-32 rounded bg-gray-200" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-6 rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
