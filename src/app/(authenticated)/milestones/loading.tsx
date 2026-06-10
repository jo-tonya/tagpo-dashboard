// §20-2: 案件進行管理ボードのスケルトン UI（client component の JS DL 中にも表示）
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* ヘッダ */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>

      {/* KPI 3 枚 */}
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg border bg-white p-3">
            <div className="mb-2 h-3 w-16 rounded bg-gray-100" />
            <div className="h-7 w-24 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* ボードカード 6 枚 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-5 w-28 rounded bg-gray-200" />
              <div className="h-5 w-12 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-gray-100" />
              <div className="h-3 w-3/4 rounded bg-gray-100" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
